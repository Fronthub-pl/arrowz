# Rounded arrows, honest ranges, and a quiet double click

Date: 2026-09-10. Status: draft design, awaiting review.

Baseline: `feat/webgl-board-layer` at `1dd5394` (PR #33, open). The WebGL layer
is not on `main` yet, so this work branches off that PR rather than off `main`.
Builds on `docs/superpowers/specs/2026-09-10-webgl-board-layer-design.md` §4
(the tesselator) and does not disturb its §5, §6 or §7.

## 1. Why

Five observations from driving the demo, in the order they were raised:

1. A double click on the board resets the view **and** clicks the arrow under
   the cursor. The reset is unwanted.
2. The pieces turn through hard right angles. The SVG export does not: it has
   asked the rasteriser for round joins since the beginning. The board should
   look the way the export looks, and the choice should be a knob.
3. `stroke` runs to 1.5 in the demo. Above about 0.9 the board is unreadable.
4. `headWidth` runs to 3, which is far past anything legible.
5. `headHeight` runs to 3, and its useful band is much narrower.

Points 3 to 5 turn out to be less of a new policy than a synchronisation. The
lab has capped `stroke` at 0.9 since it was written (`packages/cli/lab.html:232`);
the demo simply never caught up. The three surfaces disagree today:

| | stroke | headWidth | headHeight |
| --- | --- | --- | --- |
| demo (`demo/controls.ts`) | 0.05 – 1.5, default 0.5 | 0 – 3, default 0 | 0 – 3, default 0 |
| lab (`lab.html`) | 0.2 – 0.9, default 0.5 | 0 – 1.2, default 0 | 0 – 1.3, default 0 |
| CLI (`command.ts`) | unbounded, default 0.5 | unbounded, default 0 | unbounded, default 0 |

### The rounding was measured before it was chosen

Rounding a right-angle join means triangles, and the boards have a lot of
joins. A throwaway spike (branch `spike/rounded-joins`, commit `843f4aa`)
built three candidates and measured them on Insane 1000×1000 seed 7 (85 809
pieces) in a foreground Chrome on an M1, host 800×800 at devicePixelRatio 2,
with `EXT_disjoint_timer_query_webgl2` wrapped around every `drawArrays`, three
samples each:

| variant | vertices/frame | GPU ms/frame | mean |
| --- | --- | --- | --- |
| today: square joins, disc tail | 10.38 M | 17.61 · 16.97 · 16.79 | **17.12** |
| **C** quarter fan per corner | 15.35 M | 18.50 · 18.40 · 17.67 | **18.19** |
| **A** quarter fan + merged collinear runs | 12.04 M | 17.17 · 17.57 · 16.65 | **17.13** |

The noise band is about ±0.9 ms, so **A is indistinguishable from today** and C
sits at the edge of it, consistently highest.

Three numbers decided the design.

**Most polyline points are not corners.** `pieceShape` pushes the centre of
every cell into `line`, so a piece running straight through six cells carries
five 180° "joins". On Insane, one million line points hold 276 335 real corners
and 552 047 collinear points. Rounding costs far less than the point count
suggests, because two interior points in three need nothing.

**Collinear runs are free money.** Collapsing them halves the base line
geometry, which pays for most of the fans. It does not pay for all of them —
the early estimate that it would break even was wrong — but it takes a ×1.48
vertex increase down to ×1.16 and the frame cost down to zero.

**Vertices are not milliseconds.** C carries 48% more vertices than today and
costs 6% more GPU time. The layer is bound by pixels, not by vertex
processing, which is why rounding is affordable at all.

A fourth candidate — the corner as one quad with the roundness computed in the
fragment shader, the way the point grid already draws its dots
(`gl-layer.ts:61`) — is the cheapest of all and is **deliberately out of scope**;
see §10.

## 2. Rulings I made

Where the request left room for two readings, this is the reading taken. Each
is cheap to overturn; none is buried in the implementation.

**R1. A double click does nothing at all on the board.** The `dblclick`
listener goes (`arrowz-board.ts:212`, `:602`), and the second press of a rapid
mouse double (`PointerEvent.detail >= 2`) produces no click intent. The first
click still plays its piece: suppressing it would mean holding every mouse
click for the 300 ms of the double-click window, which makes the whole board
feel slow to serve a gesture nobody asked for. `fit()` keeps its ⤢ button, its
`0` key and its touch double tap.

**R2. The touch double tap keeps resetting the view.** It is a gesture the game
design §11 specifies, and a touch user has no `0` key and a small ⤢ target.
This is the ruling most likely to be overturned: if the intent was "no
double-anything resets the view", the `fit` branch in `GestureMachine.up`
(`gestures.ts:128`) goes too and `Intent` loses its `fit` member.

**R3. `rounded` governs joins and the tail cap, never the head.** The head
stays a sharp polygon in both modes. `rounded` means exactly what
`stroke-linejoin` plus the tail cap mean in the SVG, and nothing more — which
is what lets the export honour it without inventing geometry.

**R4. The CLI spells the switch `--sharp` in both dialects.** Every other view
knob has two names because it had two before (`--stroke` / `--lineweight`).
This one has no legacy, so it gets one word in both. It is negative because
`rounded` defaults to true.

**R5. `headWidth` keeps its automatic mode; only `headHeight` loses one.** The
panel's minimum for width stays 0, and 0 still means automatic. Only the height
becomes literal.

**R6. Where only a maximum was asked for, the tighter of the two existing
bounds wins.** The request named maxima and defaults, not minima or steps, and
the demo and the lab disagree on both. `stroke` takes the lab's minimum of 0.2:
below that a line is under one pixel at the CLI's default cell size of 12, so
the demo's 0.05 was never a usable setting. The head knobs take the lab's step
of 0.05 rather than the demo's 0.1, which the narrower range now affords.

## 3. Decisions

1. **`rounded` is a view field on all three surfaces**, defaulting to `true`.
   True is what the SVG has always drawn, so the default changes nothing about
   the export and brings the WebGL board into line with it. False is the new
   shape.
2. **The WebGL layer rounds with geometry, variant A.** A quarter fan per
   corner, and collinear runs merged before writing. Measured at parity with
   today; testable in Node, where the rest of `tesselate.ts` is tested.
3. **`pieceShape` loses its automatic head height.** `headHeight` becomes
   literal in cells. `headWidth` keeps `0 = automatic`.
4. **The engine's default head height becomes 1**, in both `BoardView`
   (board-element) and `View` (`command.ts`), so the CLI export and the demo
   agree without anyone setting a knob.
5. **The demo and the lab carry the same ranges**, step 0.05 throughout:
   `stroke` 0.2 – 0.9 (default 0.5), `headWidth` 0 – 0.9 (default 0, still
   automatic), `headHeight` 0.1 – 1 (default 1, now literal).
6. **`docs/images` gains a manifest and a regeneration task.** Decision 3
   changes every committed image, and there is no script that rebuilds them;
   this change writes one rather than reconstructing thirty commands by hand
   for the second time.

## 4. The rounded shape

### 4.1 Corners

A piece only ever turns through a right angle, so a rounded corner is a
quarter arc of radius `stroke / 2` centred on the turn.

Two butt-ended segments meeting at a right angle leave exactly one uncovered
square of side `half`, on the outer side of the turn. The fan sweeps that
square. Which side is outer, and which way the sweep runs, both come off the
sign of the cross product of the two directions.

`JOIN_SEGMENTS = 6`. The sagitta rule of `TAIL_SEGMENTS` applies at the
corner's own radius, which is the widest a stroke may now be: at `stroke` 0.9
and `MAX_CELL_PX` (48) on a dpr 2 screen that radius is 43 device pixels, and a
quarter arc of `k` facets is a `4k`-gon, so `43 · (1 − cos(π / 4k)) < 0.5`
needs `k` above 5.15.

When `rounded` is false the corner keeps today's shape: both segments extend
by `half` into the join, which is exactly the miter an SVG rasteriser draws at
a right angle.

### 4.2 The tail

`rounded` true keeps the disc of `TAIL_SEGMENTS` facets. False replaces it with
a square of side `stroke`, centred on the same point — the same reach, flat
sides. A piece occupies the same length in both modes, so the switch changes
corners and nothing else about how much room a piece takes.

### 4.3 Collinear runs

`mergeCollinear` collapses a polyline's straight runs before it is written.
This is not a rounding concern; it is a debt the tesselator has carried since
it was written, and it is what makes the rounding free.

Two consumers must follow:

- `rideVertexBound` must bound the worst case, which is every interior point a
  corner and the disc tail: `6(p − 1) + 3 · JOIN_SEGMENTS · (p − 2)` plus the
  head. A merged ride is always smaller, so the bound stays safe.
- `trackLine` output is merged on the same path, since `tesselatePiece` writes
  it through the same `writeLine`.

## 5. `rounded` across the three surfaces

**Engine.** `ShapeOptions` and `View` gain `rounded: boolean`. `toSvg` writes
`stroke-linejoin="round"` or `"miter"` on both stroke groups
(`engine.ts:2037`, `:2066`), and the tail becomes `<circle>` or `<rect>`
accordingly. Nothing else in the SVG changes.

**CLI.** `--sharp` in both dialects (R4). `command.ts` prints it back in the
round-trip forms at `:184` and `:336` when it differs from the default.

**Lab.** A checkbox next to `stroke`, with its label and hint in both
dictionaries (`lab-i18n.ts`, English as the source, Polish as the
translation).

**Element.** `BoardView.rounded`, a row in `VIEW_CONTROLS`, a case in
`withField`. No attribute mirrors it, like every other `view` field.

## 6. Ranges, defaults, and the images

`DEFAULT_VIEW.headHeight` becomes 1 in both packages. At the default stroke of
0.5 the old automatic height was `1.4 × 0.5 = 0.7` of a cell, so heads grow by
43% in height on every board drawn with defaults. Highlighted pieces
(`stroke × 1.15`) had an automatic height of 0.805 and now take the same 1 as
the rest, so `--top` boards change in a second way.

That is a deliberate, visible change to the CLI's default output, and it
invalidates:

- `packages/engine/svg-golden.json` — re-recorded with
  `packages/engine/scripts/record-svg-golden.ts`;
- all 30 SVGs and 34 PNGs under `docs/images`, which README.md and README.pl.md
  embed between them at 34 distinct references.

The images carry no record of the commands that made them. This change adds
`docs/images/manifest.json` (one entry per image: output name, dialect, flags)
and a task that regenerates every file from it, so the next default change is
one command rather than an archaeology exercise. The manifest is reconstructed
once, by reading what each image shows and what README claims about it, and
every regenerated image is compared against its predecessor by eye before the
old one is replaced.

## 7. The double click

`arrowz-board.ts` drops `onDoubleClick` and its listener. `apply()` gains a
guard so that a mouse press whose `detail` is 2 or more yields no click intent;
the cleanest seam is `PointerSample`, which already carries `modifier` and `t`,
gaining a `repeat: boolean` that `GestureMachine.up` refuses to turn into a
click. That keeps the rule in `gestures.ts`, where the other pointer rules live
and where they are tested as a table in Node.

## 8. Tests

Changed:

- `tesselate.test.ts:212` — the vertex-count formula gains the fan term. The
  spike showed the ridden bent piece going from 81 to 99 vertices, which is
  exactly one fan.
- `svg-golden.json` — re-recorded (§6).
- `engine.test.ts:762` — asserts `stroke-linejoin="round"`; it keeps that for
  the default and gains a case for `--sharp`.
- `geometry.test.ts` — every case that relies on the automatic head height is
  restated against a literal one.

New:

- `tesselate.test.ts` — a piece with one corner writes `3 · JOIN_SEGMENTS`
  more vertices when rounded than when sharp; a straight piece writes the same
  in both modes; `mergeCollinear` leaves a piece with no straight run
  untouched; the square tail cap covers the same bounding box as the disc.
- `gestures.test.ts` — a repeat press yields no click; a first press still
  does; the touch double tap still yields `fit` (R2).
- `arrowz-board.browser.test.ts` — a double click leaves the viewport where it
  was.
- `controls.test.ts` — every `NumberControl` default lies inside its own
  min and max. This is the assertion whose absence let the demo and the lab
  drift apart in the first place.
- `command.test.ts` — `--sharp` round-trips through both dialects, and the
  new default head height prints back only when it differs.
- `lab-i18n.test.ts` — the new label and hint exist in both dictionaries; the
  file already guards that every key is translated.

## 9. Verification

1. `pnpm nx run-many -t verify` — the whole repository.
2. `deno task verify` — the engine and the CLI, including the re-recorded
   golden hashes.
3. `ARROWZ_MEASURE=1 pnpm vitest run --project chromium perf` — Insane stays
   inside the figures of §1. The pan budget must not move.
4. By eye in the demo, at `easy-square` where the corners are large: `rounded`
   on and off, a ride played in each, and the point grid shown under both.
5. By eye across `docs/images`: every regenerated file against its
   predecessor.

## 10. Out of scope

**Splitting `gl-layer.ts`.** The file is 1024 lines and asks for it, but its
draw path, ride machinery and context lifecycle share one bag of private
mutable state, so separating them is a refactor with no user-visible payoff.
It gets its own pass, verified by the browser tests that already exist.

**The round primitive in the fragment shader.** Drawing a corner as one quad
and computing its roundness per pixel needs a second program, a second vertex
stream, two more draw blocks, a third range in `PieceRanges`, and its own
rider and removal paths — a widening of the layer's data model, not a change
to its drawing. Its measured prize over variant A is about 1 ms a frame on the
heaviest board that exists, and 13 MB of 96, because its vertices are fatter
(16 bytes against 8) even though there are three times fewer of them.

The prize is elsewhere: the tail disc is 48 vertices a piece, 4.12 M vertices
and 33 MB of variant A's 96 MB — more than every corner fan put together. One
round primitive covering the tail **and** the corners takes Insane to about
5.1 M vertices and 58 MB, half of today. That is the third pass, on a file
that is already split, and it is where the shader work belongs.

## 11. Risks

**The images.** Thirty commands reconstructed from prose is the least certain
part of this work. Mitigated by comparing every regenerated image against its
predecessor, and by the manifest existing afterwards, but a mismatch that looks
plausible could survive review.

**The head at a fixed height.** Nobody has looked at a board with
`headHeight: 1` at strokes far from 0.5. The automatic mode existed because a
fixed head was swallowed by the cap from a stroke of 0.5 up
(`geometry.ts:66`), and removing it puts that judgement in the caller's hands.
The new range (0.1 – 1) is the mitigation; the demo check of §9.4 is where it
gets confirmed.

**R2's asymmetry.** After this change a mouse double click does nothing and a
touch double tap fits. That is defensible and it is also exactly the kind of
difference that reads as a bug six months later.
