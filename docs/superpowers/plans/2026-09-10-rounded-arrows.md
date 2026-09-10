# Rounded Arrows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a piece a `rounded` view knob that rounds the corners it turns
through and the cap on its tail, make the arrowhead height literal, bring the
demo and the lab onto one set of ranges, and stop a slipped finger from
resetting the view or playing a move.

**Architecture:** The WebGL layer rounds with geometry: a six-triangle quarter
fan at every real corner, paid for by collapsing collinear runs first, which
the spike measured at parity with today. `rounded` travels as a view field
through three surfaces — the element, the SVG export and the lab — and means
exactly what `stroke-linejoin` plus the tail cap mean in SVG. The automatic
arrowhead height is deleted from `pieceShape`, which changes every committed
image and every stored board, both handled explicitly.

**Tech Stack:** TypeScript on Deno 2.9 (`packages/engine`, `packages/cli`),
TypeScript on Node with Vitest and Playwright Chromium
(`packages/board-element`), Lit 3, WebGL2, pnpm + Nx.

**Spec:** `docs/superpowers/specs/2026-09-10-rounded-arrows-design.md`

## Global Constraints

- Everything in the repository is English: code, comments, tests, docs, branch
  names, commit messages. Only the chat is Polish.
- No attribution lines in commit messages.
- No `any`, no non-null assertions. A type fix must never add a value-changing
  fallback in the engine.
- The engine and `command.ts`, `lab-simple.ts`, `lab-presets.ts`,
  `lab-i18n.ts` know neither Deno nor the DOM; `neutral.test.ts` greps for it.
  The DOM lib is referenced only in `packages/cli/lab-page.ts`.
- Never spread an array proportional to the number of cells or pieces
  (`Math.min(...arr)`): it overflows the worker stack in Chrome.
- Deno formatting: no semicolons, single quotes, line width 120. Run
  `deno fmt` before committing anything under `packages/engine` or
  `packages/cli`.
- `deno task test` must pass after every change; `deno task verify` and
  `pnpm nx run-many -t verify` before the PR.
- Note before you start: `deno task fmt` is **already red on the baseline** —
  `nx.json` has no trailing newline (commit `905000c`). Do not fix it in this
  branch and do not let it mask a real formatting failure of your own; check
  that the only file `deno fmt --check` names is `nx.json`.
- Branch: `feat/rounded-arrows`, off `feat/webgl-board-layer` (PR #33, open).
  The WebGL layer is not on `main`.
- User-facing strings in the lab are bilingual: English is the source in code,
  Polish is the translation in `lab-i18n.ts`.

---

### Task 1: A corner can be round

**Files:**
- Modify: `packages/board-element/src/view.ts`
- Modify: `packages/board-element/src/tesselate.ts`
- Modify: `packages/board-element/demo/controls.ts`
- Test: `packages/board-element/src/tesselate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BoardView.rounded: boolean` (default `true`);
  `JOIN_SEGMENTS: number` exported from `tesselate.ts`;
  `writeLine(out, o, line, half, rounded)` with the new fifth parameter.

Adding the field to `BoardView` breaks `controls.test.ts`'s "every view
control names a field the view actually has" until `VIEW_CONTROLS` gains its
row, so both belong in this task.

- [ ] **Step 1: Write the failing tests**

Append to `packages/board-element/src/tesselate.test.ts`. The file already
has `board(seed, extra)`, `points(positions, range)`, `at()` and the fixture
`BENT` (head at (5,5) facing right, one cell left, then two down: one corner,
and a straight run of two after it). Add two more fixtures next to it:

```ts
/** Head at (0,5) facing right, running straight: every interior point is collinear. */
const STRAIGHT: Piece = { id: 5, dir: 1, cells: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }] }
/** Head at (5,5) facing right, then down, then left: two corners and no straight run. */
const ZIGZAG: Piece = { id: 6, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 3, y: 6 }] }

const onlyPiece = (pc: Piece) => board(7, { pieces: [pc] })
```

```ts
test('a corner costs one fan when rounded and nothing when sharp', () => {
  const sharp = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: false }, NONE)
  const round = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const lineOf = (s: Scene) => s.rangeOf(BENT.id)?.line.count ?? 0
  // BENT turns once. A fan is JOIN_SEGMENTS triangles, three vertices each.
  expect(lineOf(round) - lineOf(sharp)).toBe(3 * JOIN_SEGMENTS)
})

test('a straight piece writes the same line in both modes', () => {
  const sharp = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: false }, NONE)
  const round = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(round.rangeOf(STRAIGHT.id)?.line.count).toBe(sharp.rangeOf(STRAIGHT.id)?.line.count)
})

test('a rounded corner stays inside the disc it replaces', () => {
  const scene = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  const half = DEFAULT_VIEW.stroke / 2
  // BENT turns at cells[1]; a cell centre sits half a cell in from its corner.
  const corner = at(BENT.cells, 1)
  const cx = corner.x + 0.5, cy = corner.y + 0.5
  // Fans are written after every segment, so the corner owns the tail of the range.
  const fan = points(scene.positions, r.line).slice(-3 * JOIN_SEGMENTS)
  for (const [x, y] of fan) expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(half + 1e-9)
})
```

Extend the import from `./tesselate.ts` with `JOIN_SEGMENTS` and the type
`Scene`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/board-element && pnpm vitest run --project node tesselate`
Expected: FAIL — `rounded` is not a property of `BoardView`, `JOIN_SEGMENTS` is
not exported.

- [ ] **Step 3: Add the field**

In `packages/board-element/src/view.ts`, in `BoardView` after `headHeight`:

```ts
  /** Round the corners a piece turns through, and cap its tail with a disc. */
  rounded: boolean
```

and in `DEFAULT_VIEW` after `headHeight: 0,`:

```ts
  rounded: true,
```

True is what `toSvg` has always drawn, so the default brings the board into
line with the export rather than changing anything.

- [ ] **Step 4: Add the fan to the tesselator**

In `packages/board-element/src/tesselate.ts`, after `TAIL_SEGMENTS`:

```ts
/**
 * Triangles in the fan that rounds one corner.
 *
 * A piece only ever turns through a right angle, so the fan sweeps a quarter
 * and its facets are those of a `4 * JOIN_SEGMENTS`-gon. The sagitta rule of
 * TAIL_SEGMENTS applies at the corner's own radius, which is the widest a
 * stroke may be: at `stroke` 0.9 and MAX_CELL_PX (48) on a dpr 2 screen that
 * is 43 device pixels, and `43 * (1 - cos(pi / 4k)) < 0.5` needs k above 5.15.
 */
export const JOIN_SEGMENTS = 6
```

Replace `const lineVertices = ...` with the corner-aware pair:

```ts
/** Whether the polyline turns at its i-th point; the game only turns by a right angle. */
function turnsAt(line: readonly [number, number][], i: number): boolean {
  const a = at(line, i - 1), b = at(line, i), c = at(line, i + 1)
  return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9
}

/** How many of a polyline's interior points are corners rather than straights. */
function cornersIn(line: readonly [number, number][]): number {
  let n = 0
  for (let i = 1; i < line.length - 1; i++) {
    if (turnsAt(line, i)) n++
  }
  return n
}

const segmentVertices = (points: number): number => (points <= 1 ? 0 : 6 * (points - 1))

/** The vertices one polyline takes, its corner fans included. */
function lineVerticesOf(line: readonly [number, number][], rounded: boolean): number {
  return segmentVertices(line.length) + (rounded ? 3 * JOIN_SEGMENTS * cornersIn(line) : 0)
}
```

Give `writeLine` the flag and the fans:

```ts
function writeLine(
  out: Float32Array,
  o: number,
  line: readonly [number, number][],
  half: number,
  rounded: boolean,
): number {
  const last = line.length - 1
  for (let i = 1; i <= last; i++) {
    const a = at(line, i - 1), b = at(line, i)
    // A rounded corner is filled by its own fan, so the segments meeting there
    // must stop at the corner: a square extension would poke out past the arc.
    const startExtend = i > 1 && !(rounded && turnsAt(line, i - 1))
    const endExtend = i < last && !(rounded && turnsAt(line, i))
    o = writeSegment(out, o, a[0], a[1], b[0], b[1], half, startExtend, endExtend)
  }
  if (!rounded) return o
  for (let i = 1; i < last; i++) {
    if (turnsAt(line, i)) o = writeJoin(out, o, line, i, half)
  }
  return o
}

/**
 * One corner as a quarter-turn fan. Two butt-ended segments meeting at a right
 * angle leave exactly one square of side `half` uncovered — the outer corner —
 * and this sweeps an arc of radius `half` across it. Which side is outer, and
 * which way the sweep runs, both come off the sign of the turn.
 */
function writeJoin(
  out: Float32Array,
  o: number,
  line: readonly [number, number][],
  i: number,
  half: number,
): number {
  const a = at(line, i - 1), b = at(line, i), c = at(line, i + 1)
  const ux = b[0] - a[0], uy = b[1] - a[1]
  const vx = c[0] - b[0], vy = c[1] - b[1]
  const turn = ux * vy - uy * vx > 0 ? 1 : -1
  const ul = Math.hypot(ux, uy)
  if (ul === 0) return o
  // The normal of the incoming segment that points away from the turn.
  const nx = (turn * uy) / ul, ny = (-turn * ux) / ul
  const a0 = Math.atan2(ny, nx)
  const step = (turn * Math.PI) / 2 / JOIN_SEGMENTS
  for (let k = 0; k < JOIN_SEGMENTS; k++) {
    const t0 = a0 + k * step, t1 = a0 + (k + 1) * step
    out[o++] = b[0]
    out[o++] = b[1]
    out[o++] = b[0] + Math.cos(t0) * half
    out[o++] = b[1] + Math.sin(t0) * half
    out[o++] = b[0] + Math.cos(t1) * half
    out[o++] = b[1] + Math.sin(t1) * half
  }
  return o
}
```

Then follow the three call sites:

- in `tesselateBoard`'s counting pass, `const line = lineVerticesOf(s.line, view.rounded)`;
- in its writing pass, `writeLine(positions, lineStart * 2, s.line, half, view.rounded)`;
- in `tesselatePiece`, `let o = writeLine(out, 0, line, half, view.rounded)`.

Finally widen `rideVertexBound`, which must bound the worst case — every
interior point a corner:

```ts
export function rideVertexBound(piece: Piece): number {
  const points = piece.cells.length + 2
  // Every interior point may be a corner, and a rounded tail is the larger cap.
  const worstLine = segmentVertices(points) + 3 * JOIN_SEGMENTS * Math.max(points - 2, 0)
  return worstLine + headVertices(MAX_HEAD_POINTS)
}
```

- [ ] **Step 5: Give the panel its row**

In `packages/board-element/demo/controls.ts`, in `VIEW_CONTROLS` before the
`colored` entry:

```ts
  {
    kind: 'bool',
    id: 'rounded',
    label: 'rounded',
    hint: 'Rounds the corners a piece turns through and caps its tail with a disc.',
    def: DEFAULT_VIEW.rounded,
  },
```

and in `withField`, before `case 'colored':`:

```ts
    case 'rounded':
      return { ...view, rounded: asBool(value) }
```

- [ ] **Step 6: Fix the ride's vertex-count assertion**

`tesselate.test.ts`'s "a ridden piece follows trackLine, corners included" pins
the old formula. `BENT` turns once, so a rounded ride writes one fan more.
Change its `want`:

```ts
  // Six vertices per segment, one fan per corner, a fan over the head polygon,
  // and the tail disc.
  const corners = expected.length > 2 ? 1 : 0
  const want = 6 * (expected.length - 1) + 3 * JOIN_SEGMENTS * corners +
    3 * (shape.head.length - 2) + 3 * TAIL_SEGMENTS
```

- [ ] **Step 7: Run the suite**

Run: `cd packages/board-element && pnpm vitest run`
Expected: PASS, all projects including Chromium.

- [ ] **Step 8: Commit**

```bash
git add packages/board-element/src/view.ts packages/board-element/src/tesselate.ts \
  packages/board-element/src/tesselate.test.ts packages/board-element/demo/controls.ts
git commit -m "A piece can turn through a rounded corner"
```

---

### Task 2: The tail cap follows `rounded`

**Files:**
- Modify: `packages/board-element/src/tesselate.ts`
- Test: `packages/board-element/src/tesselate.test.ts`

**Interfaces:**
- Consumes: `BoardView.rounded` from Task 1.
- Produces: `headVertices(points, rounded)` — the second parameter is new, so
  Task 1's `rideVertexBound` call becomes `headVertices(MAX_HEAD_POINTS, true)`.

- [ ] **Step 1: Write the failing test**

```ts
test('a sharp tail is a square with the same reach as the disc', () => {
  const round = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const sharp = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: false }, NONE)
  const headOf = (s: Scene) => s.rangeOf(BENT.id)?.head.count ?? 0
  // The disc is TAIL_SEGMENTS triangles; the square is two.
  expect(headOf(round) - headOf(sharp)).toBe(3 * TAIL_SEGMENTS - 6)

  // Same reach: the switch changes the corner, never how much room a piece takes.
  const r = sharp.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  const half = DEFAULT_VIEW.stroke / 2
  const tail = at(BENT.cells, BENT.cells.length - 1)
  const cap = points(sharp.positions, r.head).slice(-6)
  const reach = cap.reduce((m, [x, y]) => Math.max(m, Math.abs(x - (tail.x + 0.5)), Math.abs(y - (tail.y + 0.5))), 0)
  expect(reach).toBeCloseTo(half, 9)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/board-element && pnpm vitest run --project node tesselate`
Expected: FAIL — the head count is the same in both modes.

- [ ] **Step 3: Implement the square cap**

In `tesselate.ts`, widen the head count:

```ts
const headVertices = (points: number, rounded: boolean): number =>
  3 * (points - 2) + (rounded ? 3 * TAIL_SEGMENTS : 6)
```

Add the writer next to `writeDisc`:

```ts
/** The square tail cap: the same reach as the disc it replaces, with flat sides. */
function writeSquare(out: Float32Array, o: number, cx: number, cy: number, half: number): number {
  const put = (x: number, y: number): void => {
    out[o++] = x
    out[o++] = y
  }
  put(cx - half, cy - half)
  put(cx + half, cy - half)
  put(cx + half, cy + half)
  put(cx - half, cy - half)
  put(cx + half, cy + half)
  put(cx - half, cy + half)
  return o
}
```

Follow the call sites: `headVertices(s.head.length, view.rounded)` in
`tesselateBoard`'s counting pass; in its writing pass

```ts
    if (view.rounded) writeDisc(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)
    else writeSquare(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)
```

in `tesselatePiece`

```ts
  o = view.rounded ? writeDisc(out, o, tx, ty, s.tail.r) : writeSquare(out, o, tx, ty, s.tail.r)
```

and in `rideVertexBound`, `headVertices(MAX_HEAD_POINTS, true)` — the disc is
the larger cap, so the bound stays safe for both modes.

- [ ] **Step 4: Run the suite**

Run: `cd packages/board-element && pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/tesselate.ts packages/board-element/src/tesselate.test.ts
git commit -m "A sharp piece ends in a square cap, a rounded one in its disc"
```

---

### Task 3: Collinear runs are merged

**Files:**
- Modify: `packages/board-element/src/tesselate.ts`
- Test: `packages/board-element/src/tesselate.test.ts`

**Interfaces:**
- Consumes: `turnsAt`, `writeLine` from Task 1.
- Produces: no new exports; `writeLine` and `lineVerticesOf` merge internally.

This is the step that makes the rounding free. The spike measured Insane
1000×1000 at 17.13 ms of GPU a frame with it and 18.19 ms without, against
17.12 ms for today's square joins.

- [ ] **Step 1: Write the failing test**

```ts
test('a straight run costs one segment, not one per cell', () => {
  // STRAIGHT's line is three collinear points: two segments today, one after merging.
  const scene = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(scene.rangeOf(STRAIGHT.id)?.line.count).toBe(6)
})

test('merging leaves a piece with no straight run untouched', () => {
  // ZIGZAG turns at both interior points, so there is nothing to collapse.
  const scene = tesselateBoard(onlyPiece(ZIGZAG), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const shape = pieceShape(ZIGZAG, { cell: 1, pad: 0, width: DEFAULT_VIEW.stroke, headWidth: 0, headHeight: 0 })
  expect(scene.rangeOf(ZIGZAG.id)?.line.count).toBe(6 * (shape.line.length - 1) + 3 * JOIN_SEGMENTS * 2)
})

test('BENT keeps its corner and loses its straight run', () => {
  // Its line is head base, (4.5,5.5), (4.5,6.5), (4.5,7.5): one turn, then two
  // collinear points that merge into one segment. Two segments and one fan.
  const scene = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(scene.rangeOf(BENT.id)?.line.count).toBe(6 * 2 + 3 * JOIN_SEGMENTS)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/board-element && pnpm vitest run --project node tesselate`
Expected: FAIL — STRAIGHT writes 12 line vertices, not 6.

- [ ] **Step 3: Implement the merge**

In `tesselate.ts`, next to `cornersIn`:

```ts
/**
 * A polyline with its collinear runs collapsed into single segments.
 *
 * `pieceShape` pushes the centre of every cell into `line`, so a piece running
 * straight through six cells carries five 180-degree joins that cost two
 * triangles each and change nothing. Collapsing them is a debt this file has
 * carried since it was written, and it is what pays for the corner fans.
 */
function mergeCollinear(line: readonly [number, number][]): readonly [number, number][] {
  if (line.length < 3) return line
  const out: [number, number][] = [at(line, 0)]
  for (let i = 1; i < line.length - 1; i++) {
    if (turnsAt(line, i)) out.push(at(line, i))
  }
  out.push(at(line, line.length - 1))
  return out
}
```

Apply it in both the count and the write, so they can never disagree:

```ts
function lineVerticesOf(line: readonly [number, number][], rounded: boolean): number {
  const l = mergeCollinear(line)
  return segmentVertices(l.length) + (rounded ? 3 * JOIN_SEGMENTS * cornersIn(l) : 0)
}
```

and as the first line of `writeLine`'s body, renaming its parameter to `raw`:

```ts
  const line = mergeCollinear(raw)
```

`rideVertexBound` needs no change: a merged line is never longer than the one
it bounds.

- [ ] **Step 4: Run the suite**

Run: `cd packages/board-element && pnpm vitest run`

The ride assertion of Task 1 Step 6 now over-counts: `tesselatePiece` writes
`trackLine`'s output through the same `writeLine`, so the ride merges too.
`mergeCollinear` stays private, so the test collapses the expected polyline
itself rather than importing it:

```ts
  // The ride is written through the same writeLine, so it merges the same way.
  // `at` is this file's own checked index: the package allows no non-null assertions.
  const turnsAt = (l: readonly [number, number][], i: number): boolean => {
    const a = at(l, i - 1), b = at(l, i), c = at(l, i + 1)
    return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9
  }
  const corners = expected.filter((_, i) => i > 0 && i < expected.length - 1 && turnsAt(expected, i)).length
  const segments = corners + 1
  const want = 6 * segments + 3 * JOIN_SEGMENTS * corners +
    3 * (shape.head.length - 2) + 3 * TAIL_SEGMENTS
```

Expected after that edit: PASS.

- [ ] **Step 5: Measure that the rounding is still free**

Run: `cd packages/board-element && ARROWZ_MEASURE=1 pnpm vitest run --project chromium perf`
Expected: the Insane report prints and the Nightmare pan budget holds. Record
the Insane figure in the commit message.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/tesselate.ts packages/board-element/src/tesselate.test.ts
git commit -m "A straight run is one segment, which pays for the corner fans"
```

---

### Task 4: The repeated press does nothing

**Files:**
- Modify: `packages/board-element/src/gestures.ts`
- Modify: `packages/board-element/src/arrowz-board.ts:212,602,616-618`
- Test: `packages/board-element/src/gestures.test.ts`
- Test: `packages/board-element/src/arrowz-board.browser.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PointerSample.repeat: boolean`; `Intent` no longer has a
  `{ type: 'fit' }` member.

Spec R1 and R2: a second press at the same place inside the double window
yields no intent at all, on either input. The reason is a slipped finger, not
a gesture.

- [ ] **Step 1: Write the failing tests**

In `gestures.test.ts`, replace the test at line 59 ("two taps close in time and
place fit the board") with:

```ts
  test('a second tap close in time and place does nothing at all', () => {
    const m = new GestureMachine()
    m.down(touch(5, 44, 41, 0))
    expect(m.up(touch(5, 44, 41, 100))).toEqual({ type: 'click', pressX: 44, pressY: 41, x: 44, y: 41 })
    m.down(touch(6, 45, 42, 200))
    expect(m.up(touch(6, 45, 42, 250))).toEqual({ type: 'none' })
  })

  test('two quick taps far enough apart are both clicks', () => {
    const m = new GestureMachine()
    m.down(touch(5, 20, 20, 0))
    expect(m.up(touch(5, 20, 20, 40))).toEqual({ type: 'click', pressX: 20, pressY: 20, x: 20, y: 20 })
    m.down(touch(6, 80, 80, 80))
    expect(m.up(touch(6, 80, 80, 120))).toEqual({ type: 'click', pressX: 80, pressY: 80, x: 80, y: 80 })
  })
```

and in the `mouse` describe block add:

```ts
  test('a repeat press yields no click', () => {
    const m = new GestureMachine()
    m.down({ ...mouse(10, 10), repeat: true })
    expect(m.up({ ...mouse(10, 10), repeat: true })).toEqual({ type: 'none' })
  })
```

Give the two helpers the new field: `mouse` returns `repeat: false` and
`touch` returns `repeat: false`.

In `arrowz-board.browser.test.ts` add:

```ts
test('a double click leaves the viewport alone and fires one piece-click', async () => {
  const el = await mount({ play: '' })
  const canvas = canvasOf(el)
  el.zoomBy(ZOOM_STEP)
  await raf()
  const before = el.viewport
  let clicks = 0
  el.addEventListener('piece-click', () => clicks++)
  const press = (detail: number) => {
    canvas.dispatchEvent(pointer('pointerdown', 40, 40, { detail }))
    canvas.dispatchEvent(pointer('pointerup', 40, 40, { detail }))
  }
  press(1)
  press(2)
  await raf()
  expect(el.viewport).toEqual(before)
  expect(clicks).toBe(1)
})
```

The file already has `mount`, `canvasOf`, `raf` and
`pointer(type, x, y, init)`; `detail` rides in through that last argument,
which is a `Partial<PointerEventInit>`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/board-element && pnpm vitest run gestures arrowz-board`
Expected: FAIL — the second tap still returns `{ type: 'fit' }`, and the double
click still fits and clicks twice.

- [ ] **Step 3: Take `fit` out of the gesture machine**

In `gestures.ts`, add the field to the sample:

```ts
  /** The browser's own repeat count: true when this press is the second or later of a double. */
  repeat: boolean
```

Drop `| { type: 'fit' }` from `Intent`. In `up`, the touch branch becomes:

```ts
    if (press.kind === 'touch') {
      if (moved || p.t - press.t > TAP_MS) return NONE
      const tap = { x: p.x, y: p.y, t: p.t }
      // A second tap at the same place inside the window is a slipped finger,
      // not an instruction: it plays nothing and moves nothing.
      const repeat = this.lastTap !== null && tap.t - this.lastTap.t <= DOUBLE_TAP_MS &&
        dist(tap, this.lastTap) <= DOUBLE_TAP_PX
      this.lastTap = tap
      if (repeat) return NONE
      return { type: 'click', pressX: press.x, pressY: press.y, x: p.x, y: p.y }
    }
    if (wasPanning || press.repeat) return NONE
    return { type: 'click', pressX: press.x, pressY: press.y, x: p.x, y: p.y }
```

Keep `DOUBLE_TAP_MS` and `DOUBLE_TAP_PX`: they now define the window in which a
repeat is ignored, and the comment at the top of the file should say so.

- [ ] **Step 4: Take the double click out of the element**

In `arrowz-board.ts`:

- delete `canvas.addEventListener('dblclick', this.onDoubleClick)` (line 212);
- delete the `onDoubleClick` field (line 602);
- delete the `if (intent.type === 'fit')` branch of `apply()`;
- in the three pointer handlers, fill the new field when building a
  `PointerSample`: `repeat: e.detail >= 2`.

`fit()` itself stays: the chrome's button and the `0` key still call it.

- [ ] **Step 5: Run the suite**

Run: `cd packages/board-element && pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/gestures.ts packages/board-element/src/gestures.test.ts \
  packages/board-element/src/arrowz-board.ts packages/board-element/src/arrowz-board.browser.test.ts
git commit -m "A slipped finger costs neither the viewport nor a move"
```

---

### Task 5: The arrowhead height becomes literal

**Files:**
- Modify: `packages/engine/geometry.ts:63-80`
- Modify: `packages/engine/command.ts:26,52-53,73-74,185-186,337-338`
- Modify: `packages/engine/lab-i18n.ts:81-84,428-430`
- Modify: `packages/cli/store.ts:57`
- Modify: `packages/board-element/src/view.ts`
- Modify: `packages/engine/svg-golden.json` (re-recorded, not hand-edited)
- Test: `packages/engine/geometry.test.ts`
- Test: `packages/cli/store.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DEFAULT_VIEW.headHeight === 1` in both
  `packages/engine/command.ts` (`View`) and
  `packages/board-element/src/view.ts` (`BoardView`).

Spec decisions 3 and 4, and rulings R5, R7, R8. `headWidth` keeps
`0 = automatic`; only the height loses it.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/geometry.test.ts`:

```ts
Deno.test('the head height is literal, not automatic', () => {
  const pc: Piece = { id: 0, dir: 1, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
  const tall = pieceShape(pc, { cell: 10, pad: 0, width: 5, headWidth: 0, headHeight: 1 })
  const short = pieceShape(pc, { cell: 10, pad: 0, width: 5, headWidth: 0, headHeight: 0.5 })
  const height = (s: PieceShape) => Math.abs(at(s.head, 0)[0] - at(s.head, 1)[0])
  assertEquals(height(tall), 10)
  assertEquals(height(short), 5)
})

Deno.test('a head height of zero draws no head, and says so', () => {
  const pc: Piece = { id: 0, dir: 1, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
  const s = pieceShape(pc, { cell: 10, pad: 0, width: 5, headWidth: 0, headHeight: 0 })
  assertEquals(at(s.head, 0)[0], at(s.head, 1)[0])
})
```

In `packages/cli/store.test.ts`, using the `freshDir()` helper it already has:

```ts
Deno.test('a board saved when the head height was automatic reads as the new default', () => {
  freshDir()
  const params = defaultParams()
  saveBoard({
    svg: '<svg/>',
    params,
    // What every board written before this change stored: 0 meant automatic.
    view: { ...DEFAULT_VIEW, headHeight: 0 },
    command: buildCommand(params),
    source: 'test',
  })
  const [meta] = listBoards()
  assertEquals(meta?.view.headHeight, DEFAULT_VIEW.headHeight)
})
```

Import `DEFAULT_VIEW` from `@arrowz/engine/command`, which `store.test.ts`
already imports `buildCommand` and `COMMAND_PREFIX` from.

- [ ] **Step 2: Run them to verify they fail**

Run: `deno test packages/engine/geometry.test.ts packages/cli/store.test.ts --allow-read --allow-write --allow-env`
Expected: FAIL — a height of 0 still produces the automatic head.

- [ ] **Step 3: Delete the automatic height**

In `packages/engine/geometry.ts`, `autoHeight` goes and `height` becomes
literal:

```ts
  const half = Math.max(w, o.headWidth > 0 ? o.headWidth * cell : autoWidth) / 2
  const height = o.headHeight * cell
```

Update the doc comment above `pieceShape`: the sentence about "0.9 of a cell
tall" and "1.4 times as tall" describes the width's automatic mode only now,
and the closing sentence must stop saying the height can be automatic.

- [ ] **Step 4: Move both defaults to 1**

`packages/engine/command.ts:26`:

```ts
export const DEFAULT_VIEW: View = { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0 }
```

`packages/board-element/src/view.ts`, in `DEFAULT_VIEW`: `headHeight: 1,`.

Fix the two round-trip printers, which today test `> 0` and would now print the
default on every command:

- `command.ts:186`: `if (v.headHeight !== DEFAULT_VIEW.headHeight) parts.push(\`--headheight=${v.headHeight}\`)`
- `command.ts:338`: `if (v.headHeight !== DEFAULT_VIEW.headHeight) parts.push(\`--arrowheight=${v.headHeight}\`)`

Leave `headWidth`'s `> 0` alone: 0 still means automatic there.

Fix the two help rows (R8 — stop promising an automatic mode):

- `command.ts:53`: `['--headheight=R', \`arrowhead height in cells (default ${DEFAULT_VIEW.headHeight})\`]`
- `command.ts:74`: `['--arrowheight=R', \`arrowhead height in cells (default ${DEFAULT_VIEW.headHeight})\`]`

- [ ] **Step 5: Migrate the stored boards**

`packages/cli/store.ts:57` already spreads a stored view over `DEFAULT_VIEW`.
Extend it, keeping the existing comment and adding the reason:

```ts
      // A stored headHeight of 0 meant "automatic", a mode that no longer
      // exists: read it as unset. All 218 boards written before this change
      // carry it, and taken literally they would draw no arrowhead at all.
      view: { ...DEFAULT_VIEW, ...meta.view, ...(meta.view?.headHeight ? {} : { headHeight: DEFAULT_VIEW.headHeight }) },
```

- [ ] **Step 6: Retranslate the two labels**

In `packages/engine/lab-i18n.ts`, English first (it is the source):

- `headHeightLabel: 'arrowhead height (grid units)'`
- `headHelp`: rewrite so it describes the width's automatic mode only, and says
  the height is always literal.

Then the Polish at lines 428-430 to match. `lab-i18n.test.ts` guards that every
key exists in both.

- [ ] **Step 7: Re-record the golden SVG hashes**

Run: `deno run --allow-read --allow-write packages/engine/scripts/record-svg-golden.ts`
Then `deno test packages/engine/svg-golden.test.ts --allow-read --allow-write --allow-env`
Expected: PASS. Read the diff of `svg-golden.json` and confirm that **every**
case changed — a case that did not is a case that never drew a head, which
would be a bug in this task.

- [ ] **Step 8: Run both suites**

Run: `deno task verify` and `cd packages/board-element && pnpm vitest run`
Expected: PASS, except the pre-existing `nx.json` formatting failure noted in
the constraints.

- [ ] **Step 9: Commit**

```bash
git add packages/engine packages/cli/store.ts packages/board-element/src/view.ts
git commit -m "The arrowhead height is a number, not a mode"
```

---

### Task 6: `toSvg` and the CLI honour `rounded`

**Files:**
- Modify: `packages/engine/types.ts:170-188`
- Modify: `packages/engine/engine.ts:2037,2066,2054`
- Modify: `packages/engine/command.ts`
- Test: `packages/engine/engine.test.ts:762`
- Test: `packages/engine/command.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_VIEW.headHeight === 1` from Task 5.
- Produces: `SvgOptions.rounded?: boolean`, `View.rounded: boolean`
  (default `true`), the CLI switch `--sharp` in both dialects.

`ShapeOptions` is deliberately untouched: `pieceShape` returns the tail as a
centre and a radius, and whether that is drawn as a disc or a square is the
renderer's business, exactly as it is in the WebGL layer.

- [ ] **Step 1: Write the failing tests**

In `engine.test.ts`, next to the existing linejoin assertion:

```ts
Deno.test('sharp corners mitre and the tail squares off', () => {
  const r = generate(defaultParams())
  const svg = toSvg(r.board, { rounded: false })
  assert(/stroke-linejoin="miter"/.test(svg), 'corners mitre')
  assert(!/<circle /.test(svg), 'no tail disc')
  assert(/<rect [^>]*width="[\d.]+" height="[\d.]+"\/>/.test(svg), 'a square tail')
})
```

In `command.test.ts`:

```ts
Deno.test('--sharp round-trips through both dialects', () => {
  const advanced = parseArgs(['--sharp'])
  assertEquals(advanced.view.rounded, false)
  assertMatch(buildCommand(advanced.params, advanced.view), /--sharp\b/)
  const simple = parseSimpleArgs(['--width=10', '--height=10', '--sharp'])
  assertEquals(simple.view.rounded, false)
  assertMatch(buildSimpleCommand(simple.choice, simple.view), /--sharp\b/)
})

Deno.test('a rounded board prints no switch', () => {
  const r = parseArgs([])
  assertEquals(r.view.rounded, true)
  assert(!buildCommand(r.params, r.view).includes('--sharp'))
})
```

`parseArgs(argv)` returns `{ params, view, rest }`, `parseSimpleArgs(argv)`
returns `{ choice, view, rest, errors }`, and both builders take
`(subject, view: Partial<View>)`. `command.test.ts` already imports all four
names and `assertMatch`.

- [ ] **Step 2: Run them to verify they fail**

Run: `deno test packages/engine/engine.test.ts packages/engine/command.test.ts --allow-read --allow-write --allow-env`
Expected: FAIL — `rounded` is not a member of `SvgOptions` or `View`.

- [ ] **Step 3: Widen the types**

`packages/engine/types.ts`, in `SvgOptions` after `headHeight?: number`:

```ts
  rounded?: boolean
```

and in `View` after `headHeight: number`:

```ts
  rounded: boolean
```

- [ ] **Step 4: Teach `toSvg` the two shapes**

In `packages/engine/engine.ts`, near the other option reads (line 2054):

```ts
  const rounded = opts.rounded ?? true
  const join = rounded ? 'round' : 'miter'
```

Use `${join}` in both group tags (lines 2037 and 2066) in place of the literal
`round`, and make the tail follow:

```ts
    const tail = rounded
      ? `<circle cx="${s.tail.x}" cy="${s.tail.y}" r="${s.tail.r}"${fill}/>`
      : `<rect x="${s.tail.x - s.tail.r}" y="${s.tail.y - s.tail.r}" width="${s.tail.r * 2}" height="${
        s.tail.r * 2
      }"${fill}/>`
    const head = `<polygon points="${s.head.map(pt).join(' ')}"${fill}/>` + tail
```

A right angle mitres well inside the default miter limit of 4, so `miter` draws
exactly the square corner the WebGL layer draws when `rounded` is false.

- [ ] **Step 5: Add the switch to both dialects**

In `packages/engine/command.ts`:

- `DEFAULT_VIEW` gains `rounded: true`;
- `VIEW_FLAGS` gains `['--sharp', 'square corners and a square tail (default: rounded)']`;
- `SIMPLE_FLAGS` gains the same row;
- the advanced switch parser (the branch at line 225 that handles `colored`)
  gains `if (name === 'sharp') { view.rounded = false; continue }` in the same
  shape as its neighbours;
- `SIMPLE_SWITCH` gains `['sharp', ['view', 'rounded', false]]`, which needs
  `SwitchTarget` to admit `readonly ['view', 'rounded', false]`;
- both printers gain `if (!v.rounded) parts.push('--sharp')`, next to the
  `--colored` and `--colorized` lines.

- [ ] **Step 6: Run the engine suite**

Run: `deno task verify`
Expected: PASS. The golden hashes must **not** move: every golden case uses the
default, which is rounded.

- [ ] **Step 7: Commit**

```bash
git add packages/engine
git commit -m "The SVG export and the CLI take --sharp"
```

---

### Task 7: The lab gets the switch, and both surfaces get the ranges

**Files:**
- Modify: `packages/cli/lab.html:230-259`
- Modify: `packages/cli/lab-page.ts:583-592,795,1016,1038-1048,1179,1208`
- Modify: `packages/engine/lab-i18n.ts`
- Modify: `packages/board-element/demo/controls.ts`
- Test: `packages/board-element/demo/controls.test.ts`

**Interfaces:**
- Consumes: `View.rounded` from Task 6, `DEFAULT_VIEW.headHeight` from Task 5.
- Produces: nothing later tasks depend on.

Spec decision 5 and ruling R6: one set of ranges, step 0.05 throughout —
`stroke` 0.2 to 0.9 (default 0.5), `headWidth` 0 to 0.9 (default 0, still
automatic), `headHeight` 0.1 to 1 (default 1, now literal).

The lab has **two** sets of these inputs: the lab view and the library view
(`libStroke`, `libHeadWidth`, `libHeadHeight`, `libColored`). Both need the new
ranges and both need the switch.

- [ ] **Step 1: Write the failing test**

In `packages/board-element/demo/controls.test.ts`. The first test is the red
one — it pins the exact numbers the spec names, and today's demo has none of
them. The second cannot go red on its own; it is the regression net whose
absence let the demo and the lab drift apart in the first place, so write it
as a net and do not pretend it is the red step.

```ts
test('the view ranges are the ones the lab offers', () => {
  const ranges = Object.fromEntries(
    VIEW_CONTROLS.filter((c) => c.kind === 'number').map((c) => [c.id, [c.min, c.max, c.step]]),
  )
  expect(ranges).toEqual({
    stroke: [0.2, 0.9, 0.05],
    headWidth: [0, 0.9, 0.05],
    headHeight: [0.1, 1, 0.05],
    top: [0, 50, 1],
  })
})

test('every number control has a default inside its own range', () => {
  for (const control of [...ATTRIBUTES, ...VIEW_CONTROLS]) {
    if (control.kind !== 'number') continue
    expect(control.def).toBeGreaterThanOrEqual(control.min)
    expect(control.def).toBeLessThanOrEqual(control.max)
  }
})
```

`VIEW_CONTROLS.filter((c) => c.kind === 'number')` does not narrow the union on
its own; give the callback the type predicate the file's `Control` union needs,
or read `c.min` through a small `isNumberControl` guard declared next to it.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/board-element && pnpm vitest run --project node controls`
Expected: FAIL on the first test — the demo offers `stroke` 0.05 to 1.5 and
both head knobs 0 to 3.

- [ ] **Step 3: Retune the demo's ranges**

In `packages/board-element/demo/controls.ts`, `VIEW_CONTROLS`:

```ts
  { kind: 'number', id: 'stroke', label: 'stroke', hint: 'Line width as a fraction of a cell.',
    def: DEFAULT_VIEW.stroke, min: 0.2, max: 0.9, step: 0.05 },
  { kind: 'number', id: 'headWidth', label: 'headWidth', hint: 'Arrowhead width in cells; 0 is automatic.',
    def: DEFAULT_VIEW.headWidth, min: 0, max: 0.9, step: 0.05 },
  { kind: 'number', id: 'headHeight', label: 'headHeight', hint: 'Arrowhead height in cells.',
    def: DEFAULT_VIEW.headHeight, min: 0.1, max: 1, step: 0.05 },
```

keeping the object formatting the file already uses.

- [ ] **Step 4: Retune the lab's ranges, in both views**

In `packages/cli/lab.html`, six inputs in all:

```html
<input type="number" id="stroke" value="0.5" min="0.2" max="0.9" step="0.05">
<input type="number" id="headWidth" value="0" min="0" max="0.9" step="0.05">
<input type="number" id="headHeight" value="1" min="0.1" max="1" step="0.05">
```

and the same three for `libStroke`, `libHeadWidth`, `libHeadHeight`.

- [ ] **Step 5: Add the switch to both views**

In `lab.html`, next to each `colored` checkbox:

```html
<label class="check labonly"><input type="checkbox" id="rounded" checked> <span data-i18n="rounded">round the corners</span></label>
```

and inside `#libView`, the same with `id="libRounded"`.

In `lab-i18n.ts`, English first:

```ts
    rounded: 'round the corners (and the tail)',
```

then the Polish translation in the same position of the `PL` dictionary.

In `lab-page.ts`:

- `viewOptions()` gains `rounded: el<HTMLInputElement>('rounded').checked`;
- `libView()` gains `rounded: el<HTMLInputElement>('libRounded').checked`;
- the redraw listener list at line 795 gains `'rounded'`;
- the two restore paths (lines 1016 and 1208) set the checkbox from a loaded
  view, defaulting to `true` when the stored view has no such field.

- [ ] **Step 6: Run everything**

Run: `deno task verify` and `cd packages/board-element && pnpm vitest run`
Expected: PASS.

- [ ] **Step 7: Look at it**

Run: `sh packages/cli/lab.sh` and generate a small board; toggle the new
checkbox in both the lab view and the library view, and switch the language to
Polish to confirm both new strings are translated.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/lab.html packages/cli/lab-page.ts packages/engine/lab-i18n.ts \
  packages/board-element/demo/controls.ts packages/board-element/demo/controls.test.ts
git commit -m "The lab and the demo offer the same ranges, and both can go sharp"
```

---

### Task 8: The README images get a manifest and a way back

**Files:**
- Create: `docs/images/manifest.json`
- Create: `packages/cli/scripts/record-doc-images.ts`
- Modify: `deno.json:48-58` (a `docs` task)
- Modify: every file under `docs/images/`

**Interfaces:**
- Consumes: the CLI as changed by Tasks 5 and 6.
- Produces: `deno task docs`, which rebuilds every file under `docs/images/`
  from the manifest.

Task 5 changed the default arrowhead height, so all 30 SVGs and 34 PNGs are
stale, and nothing in the repository records the commands that made them. This
task writes that record down before using it.

- [ ] **Step 1: Reconstruct the manifest**

Read README.md and README.pl.md for what each image is claimed to show, and
read the SVG itself for the numbers it was drawn with — `width`/`height` give
the board size and the cell, `stroke-width` divided by the cell gives the
stroke, and a `#e8467c` group means `--top`. Write one entry per image:

```json
{
  "images": [
    { "out": "hero", "dialect": "advanced", "flags": ["--width=40", "--height=40", "--seed=7", "--cell=18"] }
  ]
}
```

Do not guess a flag you cannot see in the file. Where the SVG does not settle a
flag, say so in the entry with a `"note"` field and confirm it by regenerating
and comparing in Step 3.

- [ ] **Step 2: Write the recorder**

`packages/cli/scripts/record-doc-images.ts` reads the manifest, runs the CLI
once per entry with `--svg=docs/images/<out>.svg`, and rasterises each SVG to
`<out>.png` at the width README uses. Register it:

```json
    "docs": "deno run --allow-read --allow-write --allow-run --allow-env packages/cli/scripts/record-doc-images.ts"
```

- [ ] **Step 3: Regenerate and compare, one at a time**

Run: `deno task docs`

For each regenerated file, open it beside its predecessor from git
(`git show HEAD:docs/images/<name>`). The only difference you may accept is a
taller arrowhead. A different board, a different colour or a different size
means the manifest entry is wrong: fix the entry, not the image.

- [ ] **Step 4: Check the READMEs still say true things**

Run: `grep -n "docs/images" README.md README.pl.md`
Every referenced file must exist, and any sentence that describes an arrowhead
must still match what the image shows.

- [ ] **Step 5: Commit**

```bash
git add docs/images deno.json packages/cli/scripts/record-doc-images.ts
git commit -m "The README images record how they were made, and are made again"
```

---

### Task 9: The whole repository, verified

**Files:** none.

**Interfaces:**
- Consumes: every task above.

- [ ] **Step 1: Run the repository's own gate**

Run: `pnpm nx run-many -t verify`
Expected: PASS.

- [ ] **Step 2: Run the Deno gate**

Run: `deno task verify`
Expected: PASS except `nx.json`, which was red before this branch existed.
Confirm `deno fmt --check` names no other file.

- [ ] **Step 3: Measure Insane deliberately**

Run: `cd packages/board-element && ARROWZ_MEASURE=1 pnpm vitest run --project chromium perf`
Expected: the Insane report inside the figures the spec's §1 recorded — about
17 ms of GPU a frame, against 17.12 ms for the shape this branch replaces.

- [ ] **Step 4: Look at the demo**

Run: `cd packages/board-element && pnpm serve`

At `easy-square`, where the corners are large: `rounded` on and off; a ride
played in each; the point grid shown under both; a double click that changes
nothing; `stroke` at each end of its new range.

- [ ] **Step 5: Open the pull request**

Base it on `feat/webgl-board-layer`, not on `main`, and say so in the body: the
WebGL layer is not merged yet, so this stacks on PR #33.
