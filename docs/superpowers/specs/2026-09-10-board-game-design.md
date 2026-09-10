# `<arrowz-board>` plays the game: reducer, events and saved sessions

Date: 2026-09-10. Status: approved design, awaiting the implementation plan.

Baseline: `feat/board-element` at `905000c` (the element of PR #29, with the
exit animation on the piece's own track and the board margin). The element it
extends: `docs/superpowers/specs/2026-09-09-board-element-design.md`. The game
it implements: `docs/superpowers/specs/2026-09-07-arrowz-design.md` §2 (rules),
§10 (the reducer, its effects and lives) and §11 (rendering, monochrome).

## 1. Goal and scope

Today `<arrowz-board>` draws a board and reports clicks; nothing decides
whether a click is a legal move, because the reducer of §10 was designed and
never written. This step writes it and wires it into the element, so that a
consumer that owns nothing but a `Board` gets a playable board.

In scope:

- `packages/engine/game.ts`: the pure reducer of §10, restricted to what the
  board itself can decide — move legality, removal, the end of the board and
  the serialised session;
- the element plays: a `play` attribute, the click path through the reducer,
  the two animations already present driven by its effects;
- the events `piece-removed`, `life-lost` and `finished`;
- `saveState()` and `loadState()` on the element, and a board restored minus
  the pieces already gone;
- colouring behind an `enableColors` attribute, with a button in the chrome,
  and the hue taken from the piece id instead of its array index.

Out of scope: lives, the stopwatch, scoring, streaks, the win and loss
screens, difficulty presets, undo, hints and the storage itself. Those belong
to the host — the Angular game of road map step 4 — and §10's `Session` fields
for them (`lives`, `elapsedMs`, `mode`, `streak`, `score`) are deliberately
absent from this design. Also out of scope: persistence written by the
element, a self-contained snapshot carrying the board, and any change to the
generator.

## 2. Decisions

Rulings taken during the brainstorming of 2026-09-10.

**The reducer is a pure engine module, and the element owns an instance of
it.** `packages/engine/game.ts` knows neither the DOM nor Deno, exactly like
`engine.ts`, and joins the `NEUTRAL` list that `neutral.test.ts` greps. The
element holds one `Session` and translates its effects into the animations it
already has. Rejected: *the logic inside `packages/board-element`* (the rules
of the game would then be testable only in a browser, and unavailable to the
CLI or to a server), and *the host drives every click* (the element would stay
a view, but every consumer would have to re-implement the same wiring).

**Move legality is a lazy ray scan, and `Board` never changes during a
game.** A click scans the ray from the head cell along `piece.dir`, skipping
the piece's own cells and the cells of pieces already gone, and stops at the
first obstacle. Cost per move: at most `max(W, H)` reads of an `Int32Array` —
a thousand on the 1000x1000 ceiling. Cost at the start of a session: one pass
over the pieces to map ids, no corridor precomputation.

Rejected: *a precomputed blocking graph with in-degree counters* (§8 of the
game design). It answers "is this piece free" in constant time, but the bounce
animation needs the distance to the blocker, which is the same ray scan; the
graph would therefore buy only hints and a solvability check, both out of MVP
scope (§13), at the price of holding a graph over up to 86 000 pieces.

Rejected: *a fresh `Board` per move*, which is what the design of PR #28
recorded ("the game reducer filters the array so its next board reuses
objects"). `Board.owner` is an `Int32Array` of `W x H`: on the 1000x1000
ceiling every click would copy 4 MB and filter 86 000 pieces. That decision
was taken when the reducer was a hypothesis; §9 records it as superseded.

**The session is immutable, and its removal set is a `Uint8Array`.** `play`
returns a new `Session` whose `gone` array is a `slice()` of the previous
one — a memcpy of one byte per piece, 86 kB at the ceiling, against a walk
over every entry of a copied `Set`. Purity of §10 is kept without paying for
it.

**Lives live in the host.** The element emits `life-lost` and counts nothing;
`Session.status` has two values, `'playing'` and `'won'`. A game is lost when
the host says so, and the host then stops the board by clearing `play`. This
keeps the game variants (classic, timed), the bonuses and the loss screen out
of a view component.

**Play is a separate attribute, not a wider meaning for `interactive`.** In
the `interactive` mode without `play` the element behaves exactly as it does
today: a click emits `piece-click` and nothing else happens. The React lab of
step 3 inspects boards this way, and it must not start removing pieces because
it wanted a click handler.

**The saved session verifies the board by fingerprint.** `fingerprint(board)`
already exists and is exported (`engine.ts:2600`). It is computed only inside
`saveState()` and `loadState()`, never when a board is set, because on the
ceiling it is two million iterations. `seed` and the parameters are not in the
snapshot: `Board` does not carry them, so the element cannot know them, and the
fingerprint identifies the board more strictly than a seed would.

**`enableColors=false` is hard monochrome.** The colour button is absent from
the chrome and `view.colored` is ignored. Monochrome is part of the task
(§11), so the default is `false` and a host has to ask for the exception.

**The hue comes from the piece id.** `svg-layer.ts:441` derives it from the
index in `board.pieces`; the moment pieces start disappearing, every remaining
hue would shift. See §6.

## 3. The engine module

```ts
// packages/engine/game.ts
import type { Board } from './types.ts'

export interface Session {
  readonly board: Board
  /** Indexed by piece id: 1 once the piece has left the board. */
  readonly gone: Uint8Array
  /** Pieces still on the board. */
  readonly left: number
  readonly status: 'playing' | 'won'
}

export type Move =
  | { kind: 'exit'; pieceId: number; dir: number; left: number; status: 'playing' | 'won' }
  | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number }
  | { kind: 'ignored' }

export interface SessionSnapshot {
  v: 1
  board: { W: number; H: number; pieces: number; fingerprint: string }
  removed: number[]
  colored: boolean
}

export function newSession(board: Board): Session
export function play(session: Session, pieceId: number): { next: Session; move: Move }
export function saveSession(session: Session, colored: boolean): SessionSnapshot
export function loadSession(board: Board, snap: SessionSnapshot): Session
```

The exit direction is a plain `number`, the index into `DIRS`, because `Dir`
in `geometry.ts` names the direction *record* (`{ dx, dy, ch }`) and not the
numeric union; `Piece.dir` and `SvgLayer.animateExit` are numbers for the same
reason.

`newSession` allocates `gone` of length `maxId + 1` and an `Int32Array` map
from piece id to its index in `board.pieces`. Ids are dense today
(`engine.ts:1124` assigns `pieces.length` and nothing reindexes the array),
but the map costs one pass and removes the assumption.

`play` resolves a click in three steps:

1. an unknown id, or a piece already gone, yields `{ kind: 'ignored' }` and
   the same session;
2. the ray scan from the head cell along `piece.dir` walks cells inside the
   board, skips cells whose owner is the piece itself or a piece already gone,
   and stops at the first cell owned by a piece still present. Void cells
   (`owner === -2`) and uncarved cells (`-1`) never block: the pieces cover the
   board (§2), and a void strip is not a piece;
3. no obstacle means `exit`: `gone[pieceId] = 1`, `left - 1`, and `status`
   becomes `'won'` when `left` reaches zero. An obstacle means `bounce`, with
   `distance` in cells from the head to the cell before the blocker and
   `blockerId` the piece that stopped it, so the renderer infers nothing.

The corridor is a fixed property of the pair (head cell, direction) — the key
consequence of §2 — so removing a piece can only free other pieces, never
block them. The blocking graph is therefore acyclic and a player cannot reach a
dead end: `finished` means "every piece is gone", and no "no legal moves"
state has to be detected.

`saveSession` lists the ids where `gone` is 1, in ascending order, and records
the board's identity. `loadSession` checks `v`, then `W`, `H` and the piece
count, and only then the fingerprint — the cheap gates first. A mismatch, or
an id outside the board, throws an `Error` naming what disagreed. Ordering of
removals is not stored: undo stays out of scope, and the `v` field is how a
later schema adds it.

## 4. The element

New inputs, on top of `board`, `view`, `pad`, `lang` and `interactive`:

| Property | Type | Default | Meaning |
|---|---|---|---|
| `play` | `boolean` (attribute, reflected) | `false` | the element runs the reducer; implies interactivity |
| `enableColors` | `boolean` (attribute, reflected) | `false` | colouring is permitted (§6) |

Setting `board` starts a new session. Setting or clearing `play` while a
board is present does not: the session survives either way, so a host that
disables the board after a loss and re-enables it resumes the same game.

| Event | `detail` | When |
|---|---|---|
| `piece-click` | `{ pieceId }` | every accepted click, in both modes, before the verdict |
| `piece-removed` | `{ pieceId, left }` | the piece is free and its ride has started |
| `life-lost` | `{ pieceId, blockerId, distance }` | the piece is blocked, as the bounce starts |
| `finished` | `{ pieces }` | after the ride of the last piece resolves |
| `viewport-change` | unchanged | |

`life-lost` fires as the animation starts, not after it, so a heart on the
host's status bar dims in time with the bounce. `finished` waits for the last
animation to resolve, so a win screen does not cover a moving arrow.
`piece-removed` carries `left` because a host showing progress would otherwise
have to count clicks and know the piece total.

Clicking the same blocked piece again loses another life every time — §10
demands it, and a test covers it.

| Method | Behaviour |
|---|---|
| `saveState()` | the snapshot of §3, or `null` before a board is set |
| `loadState(snap)` | restores a session; throws when the snapshot does not match the board |
| `restart()` | drops the session and rebuilds the board in full |
| `animateExit`, `shake`, `fit`, `zoomBy`, `viewport` | unchanged |

`animateExit` and `shake` stay public: the `view` mode, the demo and the
layer's own tests drive them directly.

**Where the code lives.** `arrowz-board.ts` is 392 lines and was designed as a
thin shell (PR #28); the session does not go into it. A new
`packages/board-element/src/game-host.ts` holds a reactive controller: it owns
the `Session`, serialises the animations, emits the events and answers "is this
piece still on the board" for hit-testing. The element wires DOM events to it,
as it already does for `viewport.ts` and `gestures.ts`.

**Hit-testing.** `pieceAt` reads the piece id from `owner` (`arrowz-board.ts:309`)
and already rejects a piece mid-exit through `layer.isExiting(id)`. It gains
one more rejection: a piece the session reports as gone. `owner` is never
rewritten, so a click on a vacated cell resolves to a piece that is gone and is
ignored.

**A restored board.** `SvgLayer.setBoard` gains a set of ids to omit, so a
loaded session draws the board without the pieces already removed instead of
drawing them and animating them away.

## 5. Data flow of one click

```
pointerup -> gestures.Intent{click} -> pieceAt -> piece-click event
                                              |
                                        game-host: play(session, id)
                                              |
                    +-------------------------+--------------------------+
                    | exit                                              | bounce
       piece-removed{pieceId,left}                        life-lost{pieceId,blockerId,distance}
       layer.animateExit(pieceId, dir)                    layer.shake(pieceId, distance)
                    |
        status === 'won' -> await ride -> finished{pieces}
```

`ignored` ends the chain silently: no event, no animation, no life. A click
during another piece's ride is accepted — the rides are independent, because a
piece leaves along its own track and never enters another piece's cells (§2).

## 6. Colouring

`enableColors` is the permission; the button is the control.

- `enableColors=false`: no button in the chrome, and the effective `colored` is
  `false` whatever `view.colored` says.
- `enableColors=true`: a fourth button joins `+`, `-` and the fit button, with
  Polish and English labels in `i18n.ts`. The initial state comes from
  `view.colored`, and from `colored` in a loaded snapshot.

Internally the element keeps `coloredOverride: boolean | null` and computes the
effective flag as `enableColors && (override ?? view.colored ?? false)`. The
`view` property remains the host's input and is never written back.

**The hue moves from the array index to the piece id.** `svg-layer.ts:441`
computes `hsl(${(i * 137.508) % 360} 62% 42%)` from the index in
`board.pieces`; with pieces disappearing, the whole board would repaint after
every move. Line 361 disables the cheap identity diff whenever `colored` is on
or `top > 0`, and the `colored` half of that guard existed precisely because
the hue could shift; with the hue tied to the id, that half goes. The `top`
half stays, because the highlight of the longest pieces is a ranking over the
array. After the change a coloured board diffs like a monochrome one, so removing
one arrow during a coloured game no longer rebuilds 86 000 elements. Toggling
the mode still rebuilds, and must: every stroke on the board changes colour,
and `sameView` sees `colored` flip. The
CLI's `toSvg` is a separate code path and stays byte-identical: its hashes in
`svg-golden.json` and the fingerprints are not touched.

## 7. Files

New:

- `packages/engine/game.ts`, `packages/engine/game.test.ts`
- `packages/board-element/src/game-host.ts`, `game-host.test.ts` (Node, pure),
  `game.browser.test.ts` (Chromium, through the element)

Changed:

- `packages/engine/mod.ts`: export the module; `neutral.test.ts`: add it to
  `NEUTRAL`
- `packages/board-element/src/arrowz-board.ts`: the two attributes, the three
  events, the three methods, the controller, one more rejection in `pieceAt`
- `packages/board-element/src/svg-layer.ts`: hue from the id, omitted ids in
  `setBoard`, the diff allowed in coloured mode
- `packages/board-element/src/i18n.ts`: the colour button labels
- `packages/board-element/README.md`, `packages/engine/dist` (emitted),
  `packages/board-element/demo/`: a playable demo with a save and restore
  button
- `docs/superpowers/specs/2026-09-09-board-element-design.md`: a note that the
  filtered-array decision is superseded here

## 8. Tests

Deno, `packages/engine/game.test.ts`:

- a free piece and a blocked piece on a recorded board (a seed from
  `fingerprints.json`), with the verdicts asserted against a hand-checked case;
- the ray skips the piece's own cells: an arrow whose own track lies ahead of
  its head is free;
- void and uncarved cells do not block;
- `distance` and `blockerId` match a hand-computed corridor;
- removing the blocker frees the piece that it blocked;
- two clicks on the same blocked piece return two `bounce` moves;
- the last piece flips `status` to `'won'` and `left` to 0;
- a click on a piece already gone, and on an unknown id, returns `ignored` and
  the same session object's values;
- `play` does not mutate the session it was given (`gone` of the previous one
  is unchanged);
- a snapshot round-trips; `loadSession` throws on a different `W`, a different
  piece count, a different fingerprint, an unknown `v` and an out-of-range id.

Chromium (Vitest browser mode), `packages/board-element/src`:

- a click on a free piece removes its nodes and emits `piece-removed` with the
  right `left`;
- the last piece emits `finished` after the ride resolves, not before;
- a click on a blocked piece leaves the nodes in place, shakes by the distance
  the reducer returned and emits `life-lost` with the blocker;
- clicking the same blocked piece twice emits `life-lost` twice;
- a click on a cell vacated by a removed piece does nothing;
- `play` unset: a click emits `piece-click` only, and no piece leaves;
- `enableColors=false` renders no colour button and stays monochrome with
  `view.colored: true`; `enableColors=true` toggles and the button label
  follows `lang`;
- `loadState` draws the board without the removed pieces, and a mismatched
  snapshot throws;
- regression on hues: the colour of a piece is unchanged after another piece is
  removed.

`perf.browser.test.ts` gains two measurements on Insane 1000x1000: a click
verdict under 1 ms, and a removal in coloured mode that touches only the nodes
of the piece that left.

## 9. Superseded decisions

- **PR #28, "board updates diff by piece identity"**: the clause "the game
  reducer filters the array so its next board reuses objects" no longer holds.
  The reducer does not produce boards; `Board` is immutable for the lifetime of
  a session, and pieces leave the DOM through `animateExit` or are omitted by
  `setBoard` when a session is restored. The rest of that decision (diff by
  identity, a full rebuild on a size or view change) stands, and the coloured
  mode joins the diffing path (§6).
- **Road map (PR #25), "the web component is view-only; reducer, lives and
  scoring stay in the engine package"**: half of it stands. The reducer is an
  engine module, and lives and scoring stay outside the element — but the
  element now owns a session and plays. The `play` attribute keeps the
  view-only behaviour available for the lab.
- **Game design §13, "saving progress is out of MVP scope"**: the element now
  serialises a session. Persisting it is still the host's business, and scores
  and leaderboards remain out of scope.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The hue change alters the CLI's SVG output | `toSvg` is a separate function; the golden hashes and the byte-for-byte CLI test guard it, and they must stay green untouched |
| The diff in coloured mode reveals a latent bug in the layer's identity path | The regression test on hues plus the Insane coloured-removal measurement; the `colored` half of the guard on line 361 is removed only with both green |
| A snapshot of a large board is heavy (up to ~600 kB of ids at the ceiling) | Accepted: a typical 50x50 board is a few hundred bytes, and `v` allows delta encoding later without breaking readers |
| `finished` awaiting the last ride never fires if a rebuild cancels the animation | The layer's promises resolve on cancellation (PR #28); a test rebuilds the board mid-ride and asserts no stuck state |
| The host disables `play` mid-ride | The ride finishes and its events still fire; `play` gates the click path, not the animations |
