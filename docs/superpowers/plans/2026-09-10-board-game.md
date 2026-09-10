# The board plays the game — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<arrowz-board>` resolves a click itself — a free piece rides off the
board, a blocked one bounces and costs the host a life — and it can save and
restore the session it is playing.

**Architecture:** A new pure module `packages/engine/game.ts` holds the reducer
of the game design §10, cut down to what a board can decide: move legality by a
lazy ray scan, removal, and the end of the board. `Board` is immutable for the
lifetime of a session, so the session is a `Uint8Array` of removed pieces and
the saved snapshot is a list of ids plus the board's fingerprint. In
`packages/board-element`, a plain class `GameHost` owns the session and turns
its moves into the two animations the layer already has; the element supplies
the target (animate, shake, emit) and stays a shell.

**Tech Stack:** TypeScript on Deno 2.9 (`packages/engine`, tested with
`Deno.test` and `@std/assert`), Lit 3 with Vitest 5 in two projects — Node for
pure modules, headless Chromium via `@vitest/browser-playwright` for the
element (`packages/board-element`).

**Spec:** `docs/superpowers/specs/2026-09-10-board-game-design.md`

## Global Constraints

- Everything written into the repository is in English: code, identifiers,
  comments, tests, docs, branch names, commit messages. Only the chat is Polish.
- User-facing strings are bilingual: English is the source in code, Polish the
  translation, both in `packages/board-element/src/i18n.ts`.
- Commit subjects are declarative sentences in the repository's existing style
  ("Arrows leave the board down their own track, inside a margin"). No
  `feat:`/`fix:` prefixes and no attribution lines.
- `packages/engine` compiles under `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. No `any`, no non-null assertions: index arrays
  through a local `at()` helper that throws, as `geometry.ts` and `track.ts` do.
- Never spread an array proportional to the number of cells or pieces
  (`Math.min(...arr)`): it overflows the worker stack in Chrome.
- `packages/engine/game.ts` must stay runtime-neutral: no `Deno.`, `document.`,
  `window.`, `localStorage`, `process.`, `node:` imports or `Buffer.`.
  `neutral.test.ts` enforces it.
- Node consumers import the engine from `packages/engine/dist/`; never import
  the engine's `.ts` sources from `packages/board-element`.
- Run after every task: `pnpm nx test engine` or `pnpm nx test board-element`.
  Run `pnpm nx run-many -t verify` before opening the PR.

## Rulings taken while writing this plan

- **`GameHost` is a plain class, not a Lit `ReactiveController`** as spec §4
  words it. Nothing it does needs a render pass, and a class with an injected
  target is what lets the rules of the game be tested in the Node project
  instead of through a browser.
- **The reducer's tests use hand-built boards**, not a recorded seed from
  `fingerprints.json` as spec §8 suggests. A 3x2 board of three dominoes states
  its expected verdicts in the picture; a generated board would need the
  corridor computed a second time in the test to know the answer.
- **The exit direction is a `number`, not `Dir`.** `Dir` in `geometry.ts` names
  the direction record (`{ dx, dy, ch }`), so the numeric direction has no
  named type in this codebase; `Piece.dir` and `SvgLayer.animateExit` are
  plain numbers and the reducer matches them.

## File Structure

Create:

| File | Responsibility |
|---|---|
| `packages/engine/game.ts` | the reducer: `Session`, `play`, the ray scan, snapshots |
| `packages/engine/game.test.ts` | its Deno tests |
| `packages/board-element/src/game-host.ts` | owns one session, drives animations, decides what to emit |
| `packages/board-element/src/game-host.test.ts` | Node tests with a fake target |
| `packages/board-element/src/game.browser.test.ts` | the element playing, in Chromium |

Modify:

| File | Change |
|---|---|
| `packages/engine/mod.ts` | export the new module |
| `packages/engine/neutral.test.ts` | add `game.ts` to `NEUTRAL` |
| `packages/board-element/src/svg-layer.ts` | hue from `piece.id`, colour in `diff`, an omitted-id set in `setBoard` |
| `packages/board-element/src/arrowz-board.ts` | `play`, `enableColors`, the game target, three methods |
| `packages/board-element/src/mod.ts` | new exports and the event map |
| `packages/board-element/src/i18n.ts` | the colour button label |
| `packages/board-element/src/perf.browser.test.ts` | two measurements |
| `packages/board-element/demo/main.ts`, `demo/index.html` | a playable demo |
| `packages/board-element/README.md` | the new API |
| `docs/superpowers/specs/2026-09-09-board-element-design.md` | a note on the superseded decision |

---

### Task 1: The reducer and the ray scan

**Files:**
- Create: `packages/engine/game.ts`, `packages/engine/game.test.ts`
- Modify: `packages/engine/mod.ts`, `packages/engine/neutral.test.ts:7-16`

**Interfaces:**
- Consumes: `Board`, `Piece` from `./types.ts`; `DIRS` from `./geometry.ts`.
  Note: `Dir` in `geometry.ts` is the direction *record* (`{ dx, dy, ch }`),
  not the numeric union — the exit direction is therefore a plain `number`,
  as `Piece.dir` and `SvgLayer.animateExit` already are.
- Produces: `Session`, `Move`, `newSession(board)`, `play(session, pieceId)`.
  Task 2 adds snapshots to the same file; Task 4 consumes all of it through
  `@arrowz/engine`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/game.test.ts`:

```ts
import { assertEquals, assertThrows } from '@std/assert'
import { newSession, play } from './game.ts'
import type { Board, Piece } from './types.ts'

/**
 * A hand-built board: every cell owned, no generator involved, so the
 * expected verdicts are read off the picture rather than computed twice.
 */
function board(W: number, H: number, owner: number[], pieces: Piece[]): Board {
  return {
    W,
    H,
    owner: Int32Array.from(owner),
    pieces,
    stats: { want: pieces.length, got: pieces.length, stall: 0, strandTrunc: 0, strandLoss: 0, n: pieces.length },
    backtracks: 0,
    remaining: 0,
  }
}

/**
 *  3x2, three vertical dominoes:
 *  0 1 2      piece 0 points left off the edge, piece 1 right into piece 2,
 *  0 1 2      piece 2 up off the edge.
 */
function threeDominoes(): Board {
  return board(3, 2, [0, 1, 2, 0, 1, 2], [
    { id: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], dir: 3 },
    { id: 1, cells: [{ x: 1, y: 0 }, { x: 1, y: 1 }], dir: 1 },
    { id: 2, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }], dir: 0 },
  ])
}

Deno.test('a piece whose ray reaches the edge leaves the board', () => {
  const s = newSession(threeDominoes())
  assertEquals(s.left, 3)
  assertEquals(s.status, 'playing')
  const { next, move } = play(s, 0)
  assertEquals(move, { kind: 'exit', pieceId: 0, dir: 3, left: 2, status: 'playing' })
  assertEquals(next.left, 2)
  assertEquals(s.left, 3) // the session handed in is untouched
})

Deno.test('a piece whose ray meets another piece bounces, naming the blocker', () => {
  const { move } = play(newSession(threeDominoes()), 1)
  assertEquals(move, { kind: 'bounce', pieceId: 1, distance: 0, blockerId: 2 })
})

Deno.test('removing the blocker frees the piece it blocked', () => {
  const first = play(newSession(threeDominoes()), 2)
  assertEquals(first.move.kind, 'exit')
  const { move } = play(first.next, 1)
  assertEquals(move, { kind: 'exit', pieceId: 1, dir: 1, left: 1, status: 'playing' })
})

Deno.test('the last piece wins the board', () => {
  let s = newSession(threeDominoes())
  for (const id of [0, 2, 1]) s = play(s, id).next
  assertEquals(s.left, 0)
  assertEquals(s.status, 'won')
})

Deno.test('clicking a piece that already left, or an unknown id, changes nothing', () => {
  const after = play(newSession(threeDominoes()), 0).next
  assertEquals(play(after, 0).move, { kind: 'ignored' })
  assertEquals(play(after, 99).move, { kind: 'ignored' })
  assertEquals(play(after, 0).next.left, 2)
})

Deno.test('the ray steps over the piece\'s own cells', () => {
  //  0 0 1     piece 0 is a hook whose head at (1,1) points up through its
  //  0 0 1     own cell (1,0); piece 1 is the right-hand column.
  //  0 0 1
  const hook: Piece = {
    id: 0,
    cells: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
    dir: 0,
  }
  const column: Piece = { id: 1, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }], dir: 0 }
  const b = board(3, 3, [0, 0, 1, 0, 0, 1, 0, 0, 1], [hook, column])
  assertEquals(play(newSession(b), 0).move.kind, 'exit')
})

Deno.test('void and uncarved cells do not block, and the distance counts the cells before the blocker', () => {
  //  0 0 . 1 1   (. is a void, - an uncarved cell)
  const b = board(5, 1, [0, 0, -2, 1, 1], [
    { id: 0, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 1 },
    { id: 1, cells: [{ x: 4, y: 0 }, { x: 3, y: 0 }], dir: 1 },
  ])
  assertEquals(play(newSession(b), 0).move, { kind: 'bounce', pieceId: 0, distance: 1, blockerId: 1 })

  const open = board(4, 1, [0, 0, -2, -1], [{ id: 0, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 1 }])
  assertEquals(play(newSession(open), 0).move.kind, 'exit')
})

Deno.test('a piece with a direction outside 0..3 is a programming error, not a move', () => {
  const b = board(2, 1, [0, 0], [{ id: 0, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 9 }])
  assertThrows(() => play(newSession(b), 0), RangeError)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm nx test engine
```

Expected: FAIL — `Module not found "./game.ts"`.

- [ ] **Step 3: Write the module**

Create `packages/engine/game.ts`:

```ts
// The game of §10 of the design, reduced to what a board can decide on its
// own: whether a click is a legal move, which piece blocked it, and whether
// the board is empty. Lives, the stopwatch, streaks and scoring belong to the
// host, so nothing here counts them.
//
// A corridor is a ray from the head cell minus the piece's own cells, and it
// does not depend on the state of the board (design §2). Removing a piece can
// therefore only free others: the board never has to be rewritten, and a
// session is nothing but the set of pieces that have left.
//
// Runtime-neutral, like engine.ts: no Deno, DOM, Node or process API.
import { DIRS } from './geometry.ts'
import type { Board, Piece } from './types.ts'

export interface Session {
  readonly board: Board
  /** Indexed by piece id: 1 once the piece has left the board. */
  readonly gone: Uint8Array
  /** Piece id to its position in `board.pieces`; -1 for an id no piece has. */
  readonly index: Int32Array
  /** Pieces still on the board. */
  readonly left: number
  readonly status: 'playing' | 'won'
}

export type Move =
  // `dir` is the piece's own `dir`: 0 up, 1 right, 2 down, 3 left, the index
  // into DIRS that `animateExit` takes.
  | { kind: 'exit'; pieceId: number; dir: number; left: number; status: 'playing' | 'won' }
  | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number }
  | { kind: 'ignored' }

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

/** A fresh session over a board. The board is never modified afterwards. */
export function newSession(board: Board): Session {
  let maxId = -1
  for (const pc of board.pieces) maxId = Math.max(maxId, pc.id)
  const index = new Int32Array(maxId + 1).fill(-1)
  board.pieces.forEach((pc, i) => {
    index[pc.id] = i
  })
  return {
    board,
    gone: new Uint8Array(maxId + 1),
    index,
    left: board.pieces.length,
    status: board.pieces.length === 0 ? 'won' : 'playing',
  }
}

/** The piece of an id, or null when no piece on this board carries it. */
function pieceOf(session: Session, id: number): Piece | null {
  if (!Number.isInteger(id) || id < 0 || id >= session.index.length) return null
  const i = at(session.index, id)
  return i < 0 ? null : at(session.board.pieces, i)
}

/**
 * Walks the corridor: the ray from the head cell along the piece's direction,
 * skipping the piece's own cells and the cells of pieces that have left.
 * Returns the blocker and how many cells the piece may advance before it
 * touches it, or null when the ray reaches the edge.
 *
 * Uncarved cells (-1) and voids (-2) never block: the pieces cover the board,
 * and a void strip is a hole in the paper, not an arrow.
 */
function scan(session: Session, piece: Piece): { blockerId: number; distance: number } | null {
  const { board, gone } = session
  const { dx, dy } = at(DIRS, piece.dir)
  const head = at(piece.cells, 0)
  let x = head.x + dx
  let y = head.y + dy
  let steps = 1
  while (x >= 0 && y >= 0 && x < board.W && y < board.H) {
    const owner = at(board.owner, y * board.W + x)
    if (owner >= 0 && owner !== piece.id && at(gone, owner) === 0) {
      return { blockerId: owner, distance: steps - 1 }
    }
    x += dx
    y += dy
    steps++
  }
  return null
}

/**
 * One click. The session handed in is never modified: `gone` is copied, which
 * on the 1000x1000 ceiling is a memcpy of 86 kB, where a copied Set would be a
 * walk over every entry.
 */
export function play(session: Session, pieceId: number): { next: Session; move: Move } {
  const piece = pieceOf(session, pieceId)
  if (piece === null || at(session.gone, pieceId) === 1) return { next: session, move: { kind: 'ignored' } }
  const hit = scan(session, piece)
  if (hit !== null) {
    return { next: session, move: { kind: 'bounce', pieceId, distance: hit.distance, blockerId: hit.blockerId } }
  }
  const gone = session.gone.slice()
  gone[pieceId] = 1
  const left = session.left - 1
  const status = left === 0 ? 'won' : 'playing'
  return {
    next: { board: session.board, gone, index: session.index, left, status },
    move: { kind: 'exit', pieceId, dir: piece.dir, left, status },
  }
}
```

A direction outside 0..3 throws before any of this: `scan` reaches
`at(DIRS, piece.dir)` on its first line, and `at` throws a `RangeError`. That
is what the last test asserts, and it is why the reducer needs no validation of
its own.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm nx test engine
```

Expected: PASS, all eight new tests.

- [ ] **Step 5: Export the module and keep it neutral**

In `packages/engine/mod.ts`, after the `geometry.ts` exports:

```ts
export { newSession, play } from './game.ts'
export type { Move, Session } from './game.ts'
```

In `packages/engine/neutral.test.ts`, add `'game.ts'` to the `NEUTRAL` array.

- [ ] **Step 6: Run the whole engine gate**

```bash
pnpm nx verify engine
```

Expected: PASS. `check`, `lint`, `fmt`, `test` and `smoke` all green; the
fingerprints and the golden SVG hashes are untouched because no drawing or
carving code was edited.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/game.ts packages/engine/game.test.ts packages/engine/mod.ts packages/engine/neutral.test.ts
git commit -m "The engine decides a move: a ray scan over an immutable board"
```

---

### Task 2: Saved sessions

**Files:**
- Modify: `packages/engine/game.ts`, `packages/engine/game.test.ts`,
  `packages/engine/mod.ts`

**Interfaces:**
- Consumes: `Session` and `newSession` from Task 1; `fingerprint` from
  `./engine.ts` (`engine.ts:2600`, exported at `engine.ts:2611`).
- Produces: `SessionSnapshot`, `saveSession(session, colored)`,
  `loadSession(board, snap)`, `goneIds(session)`. Task 6 consumes them.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/game.test.ts`:

```ts
import { assert } from '@std/assert'
import { defaultParams, generate } from './engine.ts'
import { goneIds, loadSession, saveSession } from './game.ts'

Deno.test('a snapshot round-trips through a board of the same identity', () => {
  const b = generate({ ...defaultParams(), W: 20, H: 20, seed: 3 }).board
  let s = newSession(b)
  const first = b.pieces[0]
  assert(first !== undefined)
  const played = play(s, first.id)
  s = played.next
  const snap = saveSession(s, true)
  assertEquals(snap.v, 1)
  assertEquals(snap.colored, true)
  assertEquals(snap.board.W, 20)
  assertEquals(snap.board.pieces, b.pieces.length)
  if (played.move.kind === 'exit') assertEquals(snap.removed, [first.id])

  const back = loadSession(b, snap)
  assertEquals(back.left, s.left)
  assertEquals(back.status, s.status)
  assertEquals([...goneIds(back)], [...goneIds(s)])
})

Deno.test('the removed ids come out in ascending order', () => {
  const b = threeDominoes()
  let s = newSession(b)
  for (const id of [2, 0]) s = play(s, id).next
  assertEquals(saveSession(s, false).removed, [0, 2])
})

Deno.test('a snapshot is refused when it does not describe this board', () => {
  const b = generate({ ...defaultParams(), W: 20, H: 20, seed: 3 }).board
  const snap = saveSession(newSession(b), false)
  const bad = (patch: Partial<typeof snap.board>) => ({ ...snap, board: { ...snap.board, ...patch } })
  assertThrows(() => loadSession(b, bad({ W: 21 })), Error, 'board')
  assertThrows(() => loadSession(b, bad({ pieces: 1 })), Error, 'pieces')
  assertThrows(() => loadSession(b, bad({ fingerprint: 'deadbeef' })), Error, 'fingerprint')
  assertThrows(() => loadSession(b, { ...snap, v: 2 as 1 }), Error, 'version')
  assertThrows(() => loadSession(b, { ...snap, removed: [b.pieces.length + 5] }), Error, 'piece')
})

Deno.test('a loaded session that has everything removed is won', () => {
  const b = threeDominoes()
  const snap = { v: 1 as const, board: saveSession(newSession(b), false).board, removed: [0, 1, 2], colored: false }
  const s = loadSession(b, snap)
  assertEquals(s.left, 0)
  assertEquals(s.status, 'won')
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm nx test engine
```

Expected: FAIL — `goneIds`, `saveSession` and `loadSession` are not exported.

- [ ] **Step 3: Implement the snapshots**

Append to `packages/engine/game.ts`:

```ts
import { fingerprint } from './engine.ts'

/**
 * A saved game. It holds the removed ids and enough of the board's identity
 * to refuse a snapshot taken on a different one; the seed and the parameters
 * are not here, because a Board does not carry them and the fingerprint
 * identifies the board more strictly than a seed would.
 */
export interface SessionSnapshot {
  v: 1
  board: { W: number; H: number; pieces: number; fingerprint: string }
  removed: number[]
  colored: boolean
}

/** The ids of the pieces that have left, ascending. */
export function goneIds(session: Session): number[] {
  const ids: number[] = []
  for (const pc of session.board.pieces) {
    if (at(session.gone, pc.id) === 1) ids.push(pc.id)
  }
  return ids.sort((a, b) => a - b)
}

export function saveSession(session: Session, colored: boolean): SessionSnapshot {
  const { board } = session
  return {
    v: 1,
    board: { W: board.W, H: board.H, pieces: board.pieces.length, fingerprint: fingerprint(board) },
    removed: goneIds(session),
    colored,
  }
}

/**
 * Restores a session over a board. The cheap gates come first: the size and
 * the piece count are two comparisons, while the fingerprint walks the whole
 * owner grid — two million steps on the 1000x1000 ceiling.
 */
export function loadSession(board: Board, snap: SessionSnapshot): Session {
  if (snap.v !== 1) throw new Error(`game: snapshot version ${snap.v} is not readable`)
  if (snap.board.W !== board.W || snap.board.H !== board.H) {
    throw new Error(`game: snapshot board is ${snap.board.W}x${snap.board.H}, this one is ${board.W}x${board.H}`)
  }
  if (snap.board.pieces !== board.pieces.length) {
    throw new Error(`game: snapshot board has ${snap.board.pieces} pieces, this one has ${board.pieces.length}`)
  }
  if (snap.board.fingerprint !== fingerprint(board)) {
    throw new Error('game: snapshot fingerprint does not match this board')
  }
  const session = newSession(board)
  const gone = session.gone
  let left = session.left
  for (const id of snap.removed) {
    if (!Number.isInteger(id) || id < 0 || id >= session.index.length || at(session.index, id) < 0) {
      throw new Error(`game: snapshot names piece ${id}, which is not on this board`)
    }
    if (at(gone, id) === 1) continue
    gone[id] = 1
    left--
  }
  return { board, gone, index: session.index, left, status: left === 0 ? 'won' : 'playing' }
}
```

Keep the `import { fingerprint } from './engine.ts'` line up with the other
imports at the top of the file rather than in the middle; it is written here
only to show what the block needs.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm nx test engine
```

Expected: PASS.

- [ ] **Step 5: Export and verify**

In `packages/engine/mod.ts` extend the two lines from Task 1:

```ts
export { goneIds, loadSession, newSession, play, saveSession } from './game.ts'
export type { Move, Session, SessionSnapshot } from './game.ts'
```

```bash
pnpm nx verify engine
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/game.ts packages/engine/game.test.ts packages/engine/mod.ts
git commit -m "A game can be put down and picked up: snapshots keyed by the board's fingerprint"
```

---

### Task 3: The hue follows the piece, not its place in the array

**Files:**
- Modify: `packages/board-element/src/svg-layer.ts:361` (the diff guard),
  `:425-448` (`rebuild`), `:473-500` (`diff`)
- Test: `packages/board-element/src/svg-layer.browser.test.ts`

**Interfaces:**
- Produces: `hueOf(id: number): string`, exported from `svg-layer.ts` so the
  tests can state the expected colour without repeating the constant.

- [ ] **Step 1: Write the failing test**

Append to `packages/board-element/src/svg-layer.browser.test.ts`. That file
already builds a fresh `SvgLayer` into the module-level `layer` in its
`beforeEach`, makes boards with `board(seed)` and reaches nodes with
`nodes(id)`; use those rather than inventing helpers.

```ts
describe('colours follow the piece', () => {
  test('the hue of a piece does not change when another piece is removed', async () => {
    const b = board()
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    const [first, second] = [b.pieces[0], b.pieces[1]]
    expect(first && second).toBeTruthy()
    if (!first || !second) return
    const before = nodes(second.id).line.getAttribute('stroke')
    expect(before).toBe(hueOf(second.id))

    await layer.animateExit(first.id, first.dir)
    // A removal touches nodes, not the tree: the survivor keeps its colour.
    expect(nodes(second.id).line.getAttribute('stroke')).toBe(before)

    // And a redraw of the same view keeps it too, because the hue is the id's.
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    expect(nodes(second.id).line.getAttribute('stroke')).toBe(before)
  })

  test('a coloured board diffs by piece identity instead of rebuilding', () => {
    const b = board()
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    const kept = b.pieces[2]
    expect(kept).toBeTruthy()
    if (!kept) return
    const node = nodes(kept.id).line
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    // The same node object: a rebuild would have replaced it.
    expect(nodes(kept.id).line).toBe(node)
  })
})
```

Import `hueOf` at the top of the file, next to `DEFAULT_VIEW`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm nx test board-element
```

Expected: FAIL — `hueOf` is not exported, and the second test fails on a
replaced node because `canDiff` refuses a coloured view.

- [ ] **Step 3: Make the hue a function of the id**

In `packages/board-element/src/svg-layer.ts`, add next to `DEFAULT_VIEW`:

```ts
/**
 * The diagnostic hue of a piece: the golden angle over its id. It must be the
 * id and not the position in `board.pieces` — a game removes pieces, and a hue
 * read off the array would repaint the whole board after every move.
 */
export function hueOf(id: number): string {
  return `hsl(${(id * 137.508) % 360} 62% 42%)`
}
```

In `rebuild`, replace the colour expression:

```ts
    board.pieces.forEach((pc) => {
      const isLong = longest.has(pc.id)
      const col = isLong ? v.highlight : v.colored ? hueOf(pc.id) : v.ink
```

(the `i` parameter of the callback is now unused — drop it).

In `diff`, colour the pieces it appends, which until now were always ink:

```ts
    for (const pc of board.pieces) {
      if (this.nodes.has(pc.id)) continue
      const col = this.view.colored ? hueOf(pc.id) : this.view.ink
      const [line, head] = this.markup(pc, this.view.stroke, col === this.view.ink ? null : col)
```

In `setBoard`, drop `!view.colored` from `canDiff`:

```ts
    const canDiff = board !== null && this.current !== null && board.W === this.current.W &&
      board.H === this.current.H && sameView(view, this.view) && view.top === 0
```

`view.top === 0` stays: the highlight of the longest pieces is a ranking over
the array, and `diff` draws every piece at the plain stroke width.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm nx test board-element
```

Expected: PASS, and every existing test in `svg-layer.browser.test.ts` and
`arrowz-board.browser.test.ts` still green.

- [ ] **Step 5: Confirm the CLI is untouched**

```bash
pnpm nx test engine
```

Expected: PASS. `toSvg` has its own copy of the colour expression and keeps it;
`svg-golden.test.ts` and `fingerprints.test.ts` prove nothing moved.

- [ ] **Step 6: Export and commit**

Add to `packages/board-element/src/mod.ts`:

```ts
export { DEFAULT_VIEW, hueOf, SHAKE_MS } from './svg-layer.ts'
```

```bash
git add packages/board-element/src/svg-layer.ts packages/board-element/src/svg-layer.browser.test.ts packages/board-element/src/mod.ts
git commit -m "A piece keeps its colour when its neighbours leave the board"
```

---

### Task 4: The game host

**Files:**
- Create: `packages/board-element/src/game-host.ts`,
  `packages/board-element/src/game-host.test.ts`

**Interfaces:**
- Consumes: `newSession`, `play`, `saveSession`, `loadSession`, `goneIds`,
  `Session`, `SessionSnapshot` from `@arrowz/engine` (the built `dist/`, which
  the `test` target builds through `dependsOn: ["^build"]`).
- Produces: `GameHost`, `GameTarget`, `GameEvent`, `MIN_SHAKE_CELLS`. Task 5
  and Task 6 consume them from the element.

- [ ] **Step 1: Write the failing test**

Create `packages/board-element/src/game-host.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Board, Piece } from '@arrowz/engine'
import { GameHost, type GameEvent, type GameTarget, MIN_SHAKE_CELLS } from './game-host.ts'

function board(W: number, H: number, owner: number[], pieces: Piece[]): Board {
  return {
    W,
    H,
    owner: Int32Array.from(owner),
    pieces,
    stats: { want: pieces.length, got: pieces.length, stall: 0, strandTrunc: 0, strandLoss: 0, n: pieces.length },
    backtracks: 0,
    remaining: 0,
  }
}

/** The same three dominoes as the engine's tests: 0 is free, 1 is blocked by 2, 2 is free. */
function threeDominoes(): Board {
  return board(3, 2, [0, 1, 2, 0, 1, 2], [
    { id: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], dir: 3 },
    { id: 1, cells: [{ x: 1, y: 0 }, { x: 1, y: 1 }], dir: 1 },
    { id: 2, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }], dir: 0 },
  ])
}

class FakeTarget implements GameTarget {
  events: GameEvent[] = []
  exits: Array<{ pieceId: number; dir: number }> = []
  shakes: Array<{ pieceId: number; distance: number }> = []
  animateExit(pieceId: number, dir: number): Promise<void> {
    this.exits.push({ pieceId, dir })
    return Promise.resolve()
  }
  shake(pieceId: number, distance: number): Promise<void> {
    this.shakes.push({ pieceId, distance })
    return Promise.resolve()
  }
  emit(event: GameEvent): void {
    this.events.push(event)
  }
}

function hostOf(): { host: GameHost; target: FakeTarget } {
  const target = new FakeTarget()
  const host = new GameHost(target)
  host.setBoard(threeDominoes())
  return { host, target }
}

describe('a free piece', () => {
  test('rides out, is marked gone and reports how many are left', async () => {
    const { host, target } = hostOf()
    await host.click(0)
    expect(target.exits).toEqual([{ pieceId: 0, dir: 3 }])
    expect(target.events).toEqual([{ type: 'piece-removed', detail: { pieceId: 0, left: 2 } }])
    expect(host.isGone(0)).toBe(true)
    expect([...host.goneIds]).toEqual([0])
  })

  test('the last one finishes the board, after its ride', async () => {
    const { host, target } = hostOf()
    await host.click(0)
    await host.click(2)
    await host.click(1)
    expect(target.events.at(-1)).toEqual({ type: 'finished', detail: { pieces: 3 } })
    // finished comes after the ride of the piece that emptied the board
    expect(target.exits.at(-1)).toEqual({ pieceId: 1, dir: 1 })
  })
})

describe('a blocked piece', () => {
  test('shakes, names its blocker and costs a life every time', async () => {
    const { host, target } = hostOf()
    await host.click(1)
    await host.click(1)
    expect(target.events).toEqual([
      { type: 'life-lost', detail: { pieceId: 1, blockerId: 2, distance: 0 } },
      { type: 'life-lost', detail: { pieceId: 1, blockerId: 2, distance: 0 } },
    ])
    expect(host.isGone(1)).toBe(false)
  })

  test('a blocker straight ahead still bumps visibly', async () => {
    const { host, target } = hostOf()
    await host.click(1)
    // The reducer's distance is 0; a shake of 0 would draw nothing at all.
    expect(target.shakes).toEqual([{ pieceId: 1, distance: MIN_SHAKE_CELLS }])
  })
})

describe('clicks that are not moves', () => {
  test('a piece already gone, an unknown id and no board emit nothing', async () => {
    const { host, target } = hostOf()
    await host.click(0)
    target.events.length = 0
    target.exits.length = 0
    await host.click(0)
    await host.click(99)
    expect(target.events).toEqual([])
    expect(target.exits).toEqual([])

    const empty = new GameHost(new FakeTarget())
    await empty.click(0)
  })
})

describe('the gone set', () => {
  test('is one object per session, mutated in place, and replaced by a new board', async () => {
    const { host } = hostOf()
    const set = host.goneIds
    await host.click(0)
    expect(host.goneIds).toBe(set)
    expect(set.has(0)).toBe(true)
    host.setBoard(threeDominoes())
    expect(host.goneIds).not.toBe(set)
    expect(host.goneIds.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm nx test board-element
```

Expected: FAIL — `./game-host.ts` does not exist.

- [ ] **Step 3: Write the host**

Create `packages/board-element/src/game-host.ts`:

```ts
// One session of the game and the animations it asks for. The element hands
// in a target (ride a piece out, shake it, emit an event) and this class does
// the rest, so `arrowz-board.ts` stays a shell and the rules can be tested in
// Node rather than through a browser.
//
// Not a Lit ReactiveController: nothing here needs a render pass, and a plain
// class with an injected target is what makes the Node tests possible.
import { goneIds, loadSession, newSession, play, saveSession } from '@arrowz/engine'
import type { Board, Session, SessionSnapshot } from '@arrowz/engine'

export type GameEvent =
  | { type: 'piece-removed'; detail: { pieceId: number; left: number } }
  | { type: 'life-lost'; detail: { pieceId: number; blockerId: number; distance: number } }
  | { type: 'finished'; detail: { pieces: number } }

export interface GameTarget {
  animateExit(pieceId: number, dir: number): Promise<void>
  shake(pieceId: number, distance: number): Promise<void>
  emit(event: GameEvent): void
}

/**
 * The shortest bump, in cells. A blocker directly in front leaves a distance
 * of zero, and a ride of zero cells draws nothing — but the bounce is what
 * tells the player where the blocker is (design §2), so it must be visible.
 */
export const MIN_SHAKE_CELLS = 0.35

export class GameHost {
  private session: Session | null = null
  /**
   * The ids that have left, as one Set per session, mutated in place. The
   * layer compares it by identity to decide whether it may keep its nodes, so
   * it must not be rebuilt on every move.
   */
  private gone = new Set<number>()

  constructor(private readonly target: GameTarget) {}

  get goneIds(): ReadonlySet<number> {
    return this.gone
  }

  isGone(pieceId: number): boolean {
    return this.gone.has(pieceId)
  }

  /** Starts a fresh session, or drops the session when there is no board. */
  setBoard(board: Board | null): void {
    this.session = board === null ? null : newSession(board)
    this.gone = new Set()
  }

  /** Resolves once the animation the click asked for has settled. */
  async click(pieceId: number): Promise<void> {
    const session = this.session
    if (session === null) return
    const { next, move } = play(session, pieceId)
    this.session = next
    if (move.kind === 'ignored') return
    if (move.kind === 'bounce') {
      this.target.emit({
        type: 'life-lost',
        detail: { pieceId, blockerId: move.blockerId, distance: move.distance },
      })
      await this.target.shake(pieceId, Math.max(move.distance, MIN_SHAKE_CELLS))
      return
    }
    this.gone.add(pieceId)
    this.target.emit({ type: 'piece-removed', detail: { pieceId, left: move.left } })
    await this.target.animateExit(pieceId, move.dir)
    if (move.status === 'won') {
      this.target.emit({ type: 'finished', detail: { pieces: session.board.pieces.length } })
    }
  }

  save(colored: boolean): SessionSnapshot | null {
    return this.session === null ? null : saveSession(this.session, colored)
  }

  /** Restores a session; throws when the snapshot does not describe this board. */
  load(snap: SessionSnapshot): void {
    const session = this.session
    if (session === null) throw new Error('arrowz-board: no board to load a game into')
    const loaded = loadSession(session.board, snap)
    this.session = loaded
    this.gone = new Set(goneIds(loaded))
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm nx test board-element
```

Expected: PASS — the new file runs in the `node` project, the browser project
is unaffected.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/game-host.ts packages/board-element/src/game-host.test.ts
git commit -m "A game host turns a click into a ride, a bump or nothing"
```

---

### Task 5: The element plays

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (properties at `:44-61`,
  `pieceAt` at `:305-313`, `apply` at `:369-390`, `updated` at `:195-212`),
  `packages/board-element/src/mod.ts`
- Create: `packages/board-element/src/game.browser.test.ts`

**Interfaces:**
- Consumes: `GameHost`, `GameEvent`, `GameTarget` from `./game-host.ts`.
- Produces: the `play` property, the events `piece-removed`, `life-lost`,
  `finished`, and their `CustomEvent` types
  (`PieceRemovedEvent`, `LifeLostEvent`, `FinishedEvent`).

- [ ] **Step 1: Write the failing test**

Create `packages/board-element/src/game.browser.test.ts`:

```ts
import { defaultParams, DIRS, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ArrowzBoard } from './arrowz-board.ts'
import './mod.ts'

function makeBoard(seed = 7): Board {
  return generate({ ...defaultParams(), W: 30, H: 30, seed }).board
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

let el: ArrowzBoard
async function mount(attrs: Record<string, string> = {}, board = makeBoard()): Promise<ArrowzBoard> {
  el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.append(el)
  el.board = board
  await el.updateComplete
  await raf()
  await raf()
  return el
}

function svgOf(e: ArrowzBoard): SVGSVGElement {
  const svg = e.shadowRoot?.querySelector('svg')
  if (!svg) throw new Error('no svg in the shadow root')
  return svg
}

/** Clicks the centre of the head cell of a piece the way a mouse would. */
function clickPiece(e: ArrowzBoard, pieceId: number): void {
  const vp = e.viewport
  const head = e.board?.pieces.find((p) => p.id === pieceId)?.cells[0]
  if (!vp || !head) throw new Error('need a viewport and a piece')
  const r = svgOf(e).getBoundingClientRect()
  const x = r.left + (head.x + 0.5 - vp.originX) * vp.cellPx
  const y = r.top + (head.y + 0.5 - vp.originY) * vp.cellPx
  const init = { bubbles: true, composed: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y }
  const svg = svgOf(e)
  svg.dispatchEvent(new PointerEvent('pointerdown', init))
  svg.dispatchEvent(new PointerEvent('pointerup', init))
}

/**
 * The first piece of the board whose ray reaches the edge, and the first that
 * is blocked. Walked here independently of `game.ts`, so the element's tests
 * do not assume the reducer is right — they only need a piece of each kind.
 */
function verdicts(board: Board): { free: number; blocked: number; blocker: number } {
  let free = -1
  let blocked = -1
  let blocker = -1
  for (const pc of board.pieces) {
    const head = pc.cells[0]
    const d = DIRS[pc.dir]
    if (!head || !d) continue
    let x = head.x + d.dx
    let y = head.y + d.dy
    let hit = -1
    while (x >= 0 && y >= 0 && x < board.W && y < board.H) {
      const owner = board.owner[y * board.W + x] ?? -1
      if (owner >= 0 && owner !== pc.id) {
        hit = owner
        break
      }
      x += d.dx
      y += d.dy
    }
    if (hit < 0 && free < 0) free = pc.id
    if (hit >= 0 && blocked < 0) {
      blocked = pc.id
      blocker = hit
    }
  }
  return { free, blocked, blocker }
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  el?.remove()
})

describe('play', () => {
  test('a click on a free piece removes it and reports what is left', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    const seen: Array<{ pieceId: number; left: number }> = []
    el.addEventListener('piece-removed', (e) => seen.push(e.detail))
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 700))
    expect(seen).toEqual([{ pieceId: free, left: board.pieces.length - 1 }])
    expect(svgOf(el).querySelector(`g.heads > g[data-id="${free}"]`)).toBeNull()
  })

  test('a click on a blocked piece keeps it, and costs a life every time', async () => {
    const board = makeBoard()
    const { blocked, blocker } = verdicts(board)
    await mount({ play: '' }, board)
    const seen: Array<{ pieceId: number; blockerId: number }> = []
    el.addEventListener('life-lost', (e) => seen.push({ pieceId: e.detail.pieceId, blockerId: e.detail.blockerId }))
    clickPiece(el, blocked)
    await new Promise<void>((r) => setTimeout(r, 400))
    clickPiece(el, blocked)
    await new Promise<void>((r) => setTimeout(r, 400))
    expect(seen).toEqual([{ pieceId: blocked, blockerId: blocker }, { pieceId: blocked, blockerId: blocker }])
    expect(svgOf(el).querySelector(`g.heads > g[data-id="${blocked}"]`)).not.toBeNull()
  })

  test('a cell vacated by a removed piece is no longer a piece', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    const removed: number[] = []
    el.addEventListener('piece-removed', (e) => removed.push(e.detail.pieceId))
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 700))
    clickPiece(el, free) // the same screen point, now empty paper
    await new Promise<void>((r) => setTimeout(r, 400))
    expect(removed).toEqual([free])
  })

  test('without the attribute a click only reports, and nothing leaves', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ interactive: '' }, board)
    const clicks: number[] = []
    const removals: number[] = []
    el.addEventListener('piece-click', (e) => clicks.push(e.detail.pieceId))
    el.addEventListener('piece-removed', (e) => removals.push(e.detail.pieceId))
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 400))
    expect(clicks).toEqual([free])
    expect(removals).toEqual([])
    expect(svgOf(el).querySelector(`g.heads > g[data-id="${free}"]`)).not.toBeNull()
  })

  test('a board replaced mid-ride leaves no game stuck', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    let finished = 0
    el.addEventListener('finished', () => finished++)
    clickPiece(el, free)
    await raf() // the ride has started
    el.board = makeBoard(9) // a rebuild cancels it
    await el.updateComplete
    await new Promise<void>((r) => setTimeout(r, 700))
    // The cancelled ride resolved, the new board plays, and nothing finished.
    expect(finished).toBe(0)
    const next = verdicts(el.board ?? board)
    const removed: number[] = []
    el.addEventListener('piece-removed', (e) => removed.push(e.detail.pieceId))
    clickPiece(el, next.free)
    await new Promise<void>((r) => setTimeout(r, 700))
    expect(removed).toEqual([next.free])
  })

  test('the board is finished when the last piece has ridden out', async () => {
    // A two-piece board built by hand: both point off the edge.
    const board: Board = {
      W: 2,
      H: 2,
      owner: Int32Array.from([0, 1, 0, 1]),
      pieces: [
        { id: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], dir: 3 },
        { id: 1, cells: [{ x: 1, y: 0 }, { x: 1, y: 1 }], dir: 1 },
      ],
      stats: { want: 2, got: 2, stall: 0, strandTrunc: 0, strandLoss: 0, n: 2 },
      backtracks: 0,
      remaining: 0,
    }
    await mount({ play: '' }, board)
    const order: string[] = []
    el.addEventListener('piece-removed', () => order.push('removed'))
    el.addEventListener('finished', (e) => order.push(`finished:${e.detail.pieces}`))
    clickPiece(el, 0)
    await new Promise<void>((r) => setTimeout(r, 700))
    clickPiece(el, 1)
    await new Promise<void>((r) => setTimeout(r, 700))
    expect(order).toEqual(['removed', 'removed', 'finished:2'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm nx test board-element
```

Expected: FAIL — the `play` attribute does nothing, so no `piece-removed`
arrives.

- [ ] **Step 3: Wire the element**

In `packages/board-element/src/arrowz-board.ts`:

Add the imports and the event types:

```ts
import { GameHost, type GameEvent, type GameTarget } from './game-host.ts'

export type PieceRemovedEvent = CustomEvent<{ pieceId: number; left: number }>
export type LifeLostEvent = CustomEvent<{ pieceId: number; blockerId: number; distance: number }>
export type FinishedEvent = CustomEvent<{ pieces: number }>
```

Declare the property, in `static properties` after `interactive`:

```ts
    play: { type: Boolean, reflect: true },
```

and next to the other `declare` lines:

```ts
  /** Runs the reducer: a click plays the board instead of only reporting. Implies interactivity. */
  declare play: boolean
```

Make the class implement the target, and give it a host. After
`private readonly gestures = new GestureMachine()`:

```ts
  private readonly game = new GameHost(this)
```

and in the constructor, next to `this.interactive = false`:

```ts
    this.play = false
```

Add the three target methods to the public API section, after `shake`:

```ts
  /** GameTarget: the game host reaches the board through these three. */
  emit(event: GameEvent): void {
    this.dispatchEvent(new CustomEvent(event.type, { detail: event.detail, bubbles: true, composed: true }))
  }
```

`animateExit` and `shake` already have the signatures `GameTarget` asks for, so
declare the class as `export class ArrowzBoard extends LitElement implements GameTarget`.

In `updated`, start a session whenever the board changes — right after
`this.layer.setBoard(...)`:

```ts
    if (changed.has('board')) this.game.setBoard(this.board)
```

In `pieceAt`, reject a piece that has left:

```ts
    const id = board.owner[cell.y * board.W + cell.x]
    if (id === undefined || id < 0) return null
    return this.layer.isExiting(id) || this.game.isGone(id) ? null : id
```

In `apply`, play after reporting:

```ts
    if (!this.interactive && !this.play) return
    const pressed = this.pieceAt(intent.pressX, intent.pressY)
    const released = this.pieceAt(intent.x, intent.y)
    if (pressed === null || pressed !== released) return
    this.dispatchEvent(new CustomEvent('piece-click', { detail: { pieceId: pressed }, bubbles: true, composed: true }))
    // Fire and forget: the promise is the animation, and nothing here waits.
    if (this.play) void this.game.click(pressed)
```

The `over-piece` cursor in `onPointerMove` keys off `pieceAt`, which now
excludes removed pieces, so it needs no change.

`play` implying interactivity is the `!this.interactive && !this.play` guard
above, plus the CSS selector for the cursor — extend it:

```css
    :host([interactive]) svg.over-piece,
    :host([play]) svg.over-piece {
      cursor: pointer;
    }
```

- [ ] **Step 4: Declare the events**

In `packages/board-element/src/mod.ts`:

```ts
export type { BoardViewport, FinishedEvent, LifeLostEvent, PieceClickEvent, PieceRemovedEvent, ViewportChangeEvent } from './arrowz-board.ts'
export { GameHost, MIN_SHAKE_CELLS } from './game-host.ts'
export type { GameEvent, GameTarget } from './game-host.ts'
```

and extend the global map:

```ts
  interface HTMLElementEventMap {
    'piece-click': PieceClickEvent
    'piece-removed': PieceRemovedEvent
    'life-lost': LifeLostEvent
    'finished': FinishedEvent
    'viewport-change': ViewportChangeEvent
  }
```

with the three types added to the `import type` line at the top of the file.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm nx test board-element
```

Expected: PASS, including the whole existing browser suite.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/arrowz-board.ts packages/board-element/src/mod.ts packages/board-element/src/game.browser.test.ts
git commit -m "The board plays: a click rides a free arrow out or bumps a blocked one"
```

---

### Task 6: Saving and restoring a game

**Files:**
- Modify: `packages/board-element/src/svg-layer.ts` (`setBoard`, `rebuild`,
  `diff`), `packages/board-element/src/arrowz-board.ts` (`updated`, the public
  API), `packages/board-element/src/game.browser.test.ts`

**Interfaces:**
- Consumes: `GameHost.save`, `GameHost.load`, `GameHost.goneIds` from Task 4.
- Produces: `saveState()`, `loadState(snap)`, `restart()` on the element;
  `SvgLayer.setBoard(board, view, omit)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/board-element/src/game.browser.test.ts`:

```ts
describe('saving and restoring', () => {
  test('a restored board is drawn without the pieces that left', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 700))
    const snap = el.saveState()
    expect(snap?.removed).toEqual([free])

    const fresh = await mount({ play: '' }, board)
    expect(svgOf(fresh).querySelector(`g.heads > g[data-id="${free}"]`)).not.toBeNull()
    if (snap) fresh.loadState(snap)
    await fresh.updateComplete
    expect(svgOf(fresh).querySelector(`g.heads > g[data-id="${free}"]`)).toBeNull()
    expect(svgOf(fresh).querySelectorAll('g.heads > g[data-id]').length).toBe(board.pieces.length - 1)
  })

  test('a snapshot from another board is refused', async () => {
    await mount({ play: '' }, makeBoard(1))
    const snap = el.saveState()
    const other = await mount({ play: '' }, makeBoard(2))
    expect(() => {
      if (snap) other.loadState(snap)
    }).toThrow(/fingerprint|pieces|board/)
  })

  test('restart puts every piece back', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 700))
    el.restart()
    await el.updateComplete
    expect(svgOf(el).querySelectorAll('g.heads > g[data-id]').length).toBe(board.pieces.length)
    expect(el.saveState()?.removed).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm nx test board-element
```

Expected: FAIL — `el.saveState is not a function`.

- [ ] **Step 3: Teach the layer to omit pieces**

In `packages/board-element/src/svg-layer.ts`, next to the other module
constants:

```ts
const NO_OMISSIONS: ReadonlySet<number> = new Set()
```

Add the field beside `private view: BoardView = DEFAULT_VIEW`:

```ts
  /**
   * Pieces not to draw: a restored game's removed ids. Compared by identity,
   * because the game host mutates one Set per session — a fresh Set means a
   * fresh board and a rebuild, while a piece added to the old one is already
   * off the tree.
   */
  private omit: ReadonlySet<number> = NO_OMISSIONS
```

Change the signature and the guard:

```ts
  setBoard(board: Board | null, view: BoardView, omit: ReadonlySet<number> = NO_OMISSIONS): void {
    const canDiff = board !== null && this.current !== null && board.W === this.current.W &&
      board.H === this.current.H && sameView(view, this.view) && view.top === 0 && omit === this.omit
    this.view = view
    this.omit = omit
```

In `rebuild`, skip the omitted pieces — the `forEach` becomes:

```ts
    board.pieces.forEach((pc) => {
      if (this.omit.has(pc.id)) return
      const isLong = longest.has(pc.id)
```

In `diff`, skip them too:

```ts
    for (const pc of board.pieces) {
      if (this.nodes.has(pc.id) || this.omit.has(pc.id)) continue
```

`index()` builds its map from the nodes that exist, so an omitted piece simply
has none, and `hasPiece`, `nodesOf`, `animateExit` and `shake` already return
early for an id they do not know.

- [ ] **Step 4: Add the three methods to the element**

Every draw now goes through one place. In `updated`, start the session before
the draw, so the fresh session's Set is the one the layer receives:

```ts
  override updated(changed: PropertyValues<this>): void {
    if (!changed.has('board') && !changed.has('view') && !changed.has('pad')) return
    const previous = this.layer.board
    if (changed.has('board')) this.game.setBoard(this.board)
    this.redraw()
```

The rest of the method — the `pad` branch, the size comparison against
`previous`, `syncViewport` — stays exactly as it is.


Add to the public API section, after `shake`:

```ts
  /** The game in progress, as a value the host can store. */
  saveState(): SessionSnapshot | null {
    return this.game.save(false)
  }

  /** Restores a game saved by `saveState`. Throws when the snapshot is not this board's. */
  loadState(snap: SessionSnapshot): void {
    this.game.load(snap)
    this.redraw()
  }

  /** Drops the game and puts every piece back. */
  restart(): void {
    this.game.setBoard(this.board)
    this.redraw()
  }

  /** Draws the board as the session now stands. */
  private redraw(): void {
    this.layer.setBoard(this.board, { ...DEFAULT_VIEW, ...this.view }, this.game.goneIds)
  }
```

with `import type { SessionSnapshot } from '@arrowz/engine'` at the top, and
re-export the type from `mod.ts`:

```ts
export type { Session, SessionSnapshot } from '@arrowz/engine'
```

The `false` in `saveState` is the colour flag; Task 7 replaces it with the
element's effective value.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm nx test board-element
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/svg-layer.ts packages/board-element/src/arrowz-board.ts packages/board-element/src/mod.ts packages/board-element/src/game.browser.test.ts
git commit -m "A game can be put down and resumed on the same board"
```

---

### Task 7: Colours behind a permission

**Files:**
- Modify: `packages/board-element/src/i18n.ts`,
  `packages/board-element/src/i18n.test.ts`,
  `packages/board-element/src/arrowz-board.ts` (properties, `render`,
  `updated`, `saveState`, `loadState`),
  `packages/board-element/src/game.browser.test.ts`

**Interfaces:**
- Produces: the `enable-colors` attribute / `enableColors` property, the
  `colors` label, and `colored` inside the snapshot.

- [ ] **Step 1: Write the failing tests**

`i18n.test.ts` already asserts that both dictionaries carry the same keys, so
it cannot fail on a key that exists in neither. Add the expectation that names
the new label:

```ts
test('the colour button is labelled in both languages', () => {
  expect(labelsFor('pl').colors).toBe('Kolory figur')
  expect(labelsFor('en').colors).toBe('Piece colours')
})
```


Append to `packages/board-element/src/game.browser.test.ts`:

```ts
describe('colours', () => {
  const colourButton = (e: ArrowzBoard): HTMLButtonElement | null =>
    e.shadowRoot?.querySelector('button.colors') ?? null

  test('without the permission there is no button and no colour', async () => {
    await mount({ play: '' })
    el.view = { colored: true }
    await el.updateComplete
    expect(colourButton(el)).toBeNull()
    const first = el.board?.pieces[0]
    expect(first).toBeTruthy()
    if (first) expect(svgOf(el).querySelector(`g.pieces > g[data-id="${first.id}"]`)?.getAttribute('stroke')).toBeNull()
  })

  test('with the permission the button paints the board and its label follows lang', async () => {
    await mount({ 'enable-colors': '', lang: 'pl' })
    const button = colourButton(el)
    expect(button?.getAttribute('aria-label')).toBe('Kolory figur')
    expect(button?.getAttribute('aria-pressed')).toBe('false')
    button?.click()
    await el.updateComplete
    const first = el.board?.pieces[0]
    if (first) {
      expect(svgOf(el).querySelector(`g.pieces > g[data-id="${first.id}"]`)?.getAttribute('stroke'))
        .toBe(hueOf(first.id))
    }
    expect(colourButton(el)?.getAttribute('aria-pressed')).toBe('true')
  })

  test('a board may arrive coloured, and the choice travels in the snapshot', async () => {
    await mount({ 'enable-colors': '', play: '' })
    el.view = { colored: true }
    await el.updateComplete
    expect(el.saveState()?.colored).toBe(true)
    colourButton(el)?.click()
    await el.updateComplete
    expect(el.saveState()?.colored).toBe(false)

    const snap = el.saveState()
    const fresh = await mount({ 'enable-colors': '', play: '' }, el.board ?? makeBoard())
    if (snap) fresh.loadState({ ...snap, colored: true })
    await fresh.updateComplete
    expect(colourButton(fresh)?.getAttribute('aria-pressed')).toBe('true')
  })
})
```

Import `hueOf` from `./svg-layer.ts` at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm nx test board-element
```

Expected: FAIL — no `enable-colors` attribute, no button, `colors` missing from
the dictionaries.

- [ ] **Step 3: Add the label**

In `packages/board-element/src/i18n.ts`, add `colors: string` to `BoardLabels`
and the entries:

```ts
    colors: 'Piece colours',
```
```ts
    colors: 'Kolory figur',
```

- [ ] **Step 4: Add the permission, the state and the button**

In `packages/board-element/src/arrowz-board.ts`:

```ts
    enableColors: { type: Boolean, reflect: true, attribute: 'enable-colors' },
    coloredOverride: { state: true },
```
```ts
  /** Permission to colour the board. Without it the element is monochrome and shows no button. */
  declare enableColors: boolean
  /** The button's choice; null while the board still follows `view.colored`. */
  declare coloredOverride: boolean | null
```

with `this.enableColors = false` and `this.coloredOverride = null` in the
constructor.

The effective flag, next to the private helpers:

```ts
  /**
   * Whether the pieces are drawn in their own hues. The permission wins over
   * everything: monochrome is part of the task (design §11), so a host has to
   * ask for the exception before either the button or `view.colored` counts.
   */
  private get colored(): boolean {
    return this.enableColors && (this.coloredOverride ?? this.view.colored ?? false)
  }
```

Every draw goes through the same view now, so replace both `setBoard` calls
(in `updated` and in `redraw`) with `redraw()` and give it the flag:

```ts
  private redraw(): void {
    this.layer.setBoard(
      this.board,
      { ...DEFAULT_VIEW, ...this.view, colored: this.colored },
      this.game.goneIds,
    )
  }
```

Extend the early return of `updated` so a toggle repaints:

```ts
    if (
      !changed.has('board') && !changed.has('view') && !changed.has('pad') &&
      !changed.has('coloredOverride') && !changed.has('enableColors')
    ) return
```

and treat a colour change like a view change (it repaints the same cells, so
the viewport does not move): the existing `if (!changed.has('board')) return`
after the `pad` branch already does exactly that.

In `render`, after the fit button:

```ts
        ${this.enableColors
          ? html`<button
              type="button"
              class="colors"
              title=${l.colors}
              aria-label=${l.colors}
              aria-pressed=${this.colored ? 'true' : 'false'}
              @click=${() => this.coloredOverride = !this.colored}
            >◑</button>`
          : ''}
```

Finally let the snapshot carry it:

```ts
  saveState(): SessionSnapshot | null {
    return this.game.save(this.colored)
  }

  loadState(snap: SessionSnapshot): void {
    this.game.load(snap)
    this.coloredOverride = snap.colored
    this.redraw()
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm nx test board-element
```

Expected: PASS. The `node` project's `i18n.test.ts` and the browser suite are
both green.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/i18n.ts packages/board-element/src/i18n.test.ts packages/board-element/src/arrowz-board.ts packages/board-element/src/game.browser.test.ts
git commit -m "Colours are a permission the host grants and a button the player presses"
```

---

### Task 8: The demo, the measurements and the documents

**Files:**
- Modify: `packages/board-element/demo/main.ts`,
  `packages/board-element/demo/index.html`,
  `packages/board-element/src/perf.browser.test.ts`,
  `packages/board-element/README.md`,
  `docs/superpowers/specs/2026-09-09-board-element-design.md`

- [ ] **Step 1: Write the failing measurement**

Append to `packages/board-element/src/perf.browser.test.ts`. That file has
`mount(size)`, `raf` and `svgOf`, and gates its heavy case with
`test.skipIf(import.meta.env.ARROWZ_MEASURE !== '1')`; the new case follows the
same shape. The layer is private, so node identity is read from the DOM.

```ts
test.skipIf(import.meta.env.ARROWZ_MEASURE !== '1')('measures a verdict and a coloured removal on Insane', async () => {
  const board: Board = generate({ ...defaultParams(), W: 1000, H: 1000, seed: 7 }).board

  // The verdict alone, with no rendering in the way: the reducer's cost.
  const host = new GameHost({
    animateExit: () => Promise.resolve(),
    shake: () => Promise.resolve(),
    emit: () => {},
  })
  host.setBoard(board)
  const worst = board.pieces.reduce((a, b) => (a.cells.length >= b.cells.length ? a : b))
  const t0 = performance.now()
  await host.click(worst.id)
  const verdictMs = performance.now() - t0
  console.log(`insane verdict: piece=${worst.id} cells=${worst.cells.length} ${verdictMs.toFixed(3)}ms`)
  expect(verdictMs).toBeLessThan(1)

  // A removal in coloured mode must touch the nodes of one piece, not the tree.
  const el = await mount('800px')
  el.enableColors = true
  el.view = { colored: true }
  el.board = board
  await el.updateComplete
  await raf()
  const survivor = board.pieces[1]
  const leaving = board.pieces[0]
  expect(survivor && leaving).toBeTruthy()
  if (!survivor || !leaving) return
  const node = svgOf(el).querySelector(`g.pieces > g[data-id="${survivor.id}"]`)
  await el.animateExit(leaving.id, leaving.dir)
  expect(svgOf(el).querySelector(`g.pieces > g[data-id="${survivor.id}"]`)).toBe(node)
  el.remove()
}, 180_000)
```

Import `GameHost` from `./game-host.ts` at the top of the file.


- [ ] **Step 2: Run the measurement**

```bash
ARROWZ_MEASURE=1 pnpm nx test board-element
```

Expected: PASS, with the verdict printed. Without the variable the heavy case
is skipped, as the other Insane cases already are.

- [ ] **Step 3: Make the demo playable**

In `packages/board-element/demo/index.html` add three buttons next to the
existing controls:

```html
<button id="save">Save</button>
<button id="load">Load</button>
<button id="restart">Restart</button>
<span id="left"></span>
<span id="lives"></span>
```

In `packages/board-element/demo/main.ts`, set `board.play = true` and
`board.enableColors = true` on the element the page already creates, and wire
the host's half of the game — the part that belongs outside the element:

```ts
let lives = 3
let saved: SessionSnapshot | null = null

board.addEventListener('piece-removed', (e) => {
  leftLabel.textContent = `left: ${e.detail.left}`
})
board.addEventListener('life-lost', (e) => {
  lives--
  livesLabel.textContent = `lives: ${lives} (blocked by ${e.detail.blockerId})`
  if (lives === 0) board.play = false
})
board.addEventListener('finished', (e) => {
  livesLabel.textContent = `cleared ${e.detail.pieces} pieces`
})
saveButton.addEventListener('click', () => {
  saved = board.saveState()
})
loadButton.addEventListener('click', () => {
  if (saved) board.loadState(saved)
})
restartButton.addEventListener('click', () => {
  lives = 3
  board.play = true
  board.restart()
})
```

- [ ] **Step 4: Check the demo by hand**

```bash
pnpm nx serve board-element
```

Open http://localhost:8778, click a few arrows: a free one rides out and the
counter drops, a blocked one bumps and takes a life, the colour button paints
the board, Save then a few more clicks then Load returns the earlier position.

- [ ] **Step 5: Update the documents**

In `packages/board-element/README.md`, add to the property table:

```markdown
| `play` | `boolean` (attribute, reflected) | `false` |
| `enableColors` | `boolean` (attribute `enable-colors`, reflected) | `false` |
```

to the method table:

```markdown
| `saveState()` | the game in progress as a value the host can store, or `null` before a board is set |
| `loadState(snap)` | restores a game; throws when the snapshot is not this board's |
| `restart()` | drops the game and puts every piece back |
```

and to the event table:

```markdown
| `piece-removed` | `{ pieceId, left }`, when a free piece starts its ride |
| `life-lost` | `{ pieceId, blockerId, distance }`, when a blocked piece starts its bounce |
| `finished` | `{ pieces }`, after the ride of the last piece |
```

Then a section:

```markdown
### Playing the board

With `play` the element decides the move itself: a free piece rides out, a
blocked one bounces against the piece that stops it. The element counts no
lives — it reports `life-lost` and the host decides what that costs, and stops
the board by clearing `play`. `saveState()` hands back the game as a small
value (the removed ids, the board's fingerprint and the colour choice); where
it is kept is the host's business.

Colours are off unless `enableColors` is set: monochrome is part of the puzzle,
so telling the pieces apart without colour is the task. With the permission the
board grows a fourth chrome button, and a board may arrive coloured through
`view.colored` or through a loaded game.
```

In `docs/superpowers/specs/2026-09-09-board-element-design.md`, in the decision
"Board updates diff by piece identity", add one sentence: the clause about the
reducer filtering the array is superseded by
`docs/superpowers/specs/2026-09-10-board-game-design.md` §2, which keeps
`Board` immutable for the lifetime of a session.


- [ ] **Step 6: Run the whole gate**

```bash
pnpm nx run-many -t verify
```

Expected: PASS for every project.

- [ ] **Step 7: Commit**

```bash
git add packages/board-element/demo packages/board-element/src/perf.browser.test.ts packages/board-element/README.md docs/superpowers/specs/2026-09-09-board-element-design.md
git commit -m "The demo plays a game, and the documents say how the board does it"
```
