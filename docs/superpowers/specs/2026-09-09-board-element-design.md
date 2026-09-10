# `<arrowz-board>`: the board web component (road map step 2)

Date: 2026-09-09. Status: approved design, awaiting the implementation plan.

Baseline: `main` at `62ad47a` (monorepo of PR #27: `packages/engine`,
`packages/cli`, pnpm + Nx, CI). Road map and boundaries:
`docs/superpowers/specs/2026-09-09-monorepo-design.md` §2 and §11.1. Game
design that the element serves: `docs/superpowers/specs/2026-09-07-arrowz-design.md`
§10 (effects) and §11 (rendering, viewport, controls).

## 1. Goal and scope

A universal board view: a custom element that draws a `Board`, keeps its own
zoom and pan, animates the two effects of the game reducer and reports clicks
on pieces. It is the renderer of the React lab (step 3) and of the Angular
game (step 4), so it must be usable from any framework and from plain HTML.

In scope:

- the package `packages/board-element` (`@arrowz/board-element`) on Lit 3,
- the `geometry` module of the engine, extracted from `toSvg` so the element
  and the CLI draw the same shapes from one source,
- a demo page that loads presets and measures rendering at Nightmare and
  Insane,
- tests in Node (pure modules) and in Chromium (the element),
- Nx targets and the CI step that installs the test browser.

Out of scope (see §14): a React wrapper, Canvas, virtualisation, hover
highlight, keyboard piece selection, SSR, moving the old Deno lab onto the
element, publishing to npm.

## 2. Decisions

Rulings taken during the brainstorming of 2026-09-09.

**Thin Lit shell over an imperative SVG layer.** Lit renders only the chrome
(the zoom buttons, the pan hint, the `<svg>` container). The pieces are built
once per board as SVG markup inserted in a single operation, and the element
keeps a map from piece id to node. Rejected: *everything in Lit templates
with `repeat`* (every property change would diff a template of up to 86 000
items on Insane); *`toSvg` + `innerHTML` like the old lab* (pixel units with a
margin, no piece ids, and the element would depend on the CLI export format).

**SVG first, measured, decided after.** Zoom and pan change one `viewBox`
attribute, which the browser composites without touching the nodes; the one
open question is whether a tree of ~260 000 nodes (Insane) pans smoothly.
The demo (§11) measures build time and frame time at Nightmare and Insane;
Canvas or viewport virtualisation is a separate step only if the numbers
fail. The per-piece `<g>` is the first thing to remove if they do.

**Tests: Vitest in Node for the pure modules, Vitest browser mode with
Playwright Chromium for the element.** Rejected: *happy-dom only* (no layout,
no SVG geometry, no performance numbers); *`@web/test-runner`* (a second
runner in a repository that will already have Vitest for the React lab).

**No React wrapper in this step.** `@lit/react` is used where it is first
needed, in `apps/lab` (step 3). The package has no peer dependency on React.

**Labels through the standard `lang` attribute, dictionary inside the
package.** `<arrowz-board lang="pl">` selects Polish; anything else falls back
to English. Rejected: a `labels` property (every consumer would carry the
dictionaries).

**No decorators.** Reactive properties are declared with
`static properties`, so the package compiles identically under `tsc`, Vite
(esbuild) and the Angular builder without `experimentalDecorators` or
`useDefineForClassFields` settings. Lit itself recommends experimental
decorators for size reasons; five properties do not justify a compiler flag
that three toolchains would have to agree on.

**Colours and stroke are properties, not CSS custom properties.** The look is
one `view` object, the same knobs as the CLI (`--lineweight`,
`--arrowwidth`, `--arrowheight`, `--colorized`, `--top`), so the lab can show
exactly what the CLI exports. CSS custom properties would split the look
between two channels.

## 3. Package layout

```
packages/board-element/
  package.json          @arrowz/board-element, type module, exports ./dist/mod.js
  project.json          Nx targets (§13)
  tsconfig.json         type check of src, tests and demo (noEmit)
  tsconfig.build.json   emission of src/ to dist/ (nodenext, es2022, dom)
  vitest.config.ts      two projects: node (pure modules) and chromium (element)
  vite.config.ts        the demo server (root: demo/)
  README.md             usage from HTML, React, Angular; the API table
  src/
    mod.ts              public surface: the element class, types, dictionary
    arrowz-board.ts     the LitElement: properties, chrome, wiring, public methods
    svg-layer.ts        board -> SVG markup, the id -> node map, diffing, animations
    viewport.ts         pure math: fit, zoom, pan, clamping, screen <-> cell
    gestures.ts         pure state machine: pointer/touch/wheel/keys -> intents
    i18n.ts             BOARD_LABELS (en source, pl translation)
    viewport.test.ts    Node
    gestures.test.ts    Node
    i18n.test.ts        Node
    arrowz-board.browser.test.ts   Chromium
    svg-layer.browser.test.ts      Chromium
  demo/
    index.html, main.ts, worker.ts   preset picker, measurements (§11)
```

Dependencies: `lit ^3.3.3`, `@arrowz/engine workspace:*`. Dev:
`vitest ^5.0.0`, `@vitest/browser-playwright ^5.0.0`, `playwright ^1.63`,
`vite ^8.2`, `typescript` from the root. The package is a pnpm workspace
member, not a Deno workspace member; Deno formats and lints it from the root
like every other file (§13).

`package.json`:

```json
{
  "name": "@arrowz/board-element",
  "version": "1.0.0-alpha.1",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/mod.d.ts", "default": "./dist/mod.js" } },
  "sideEffects": ["./dist/arrowz-board.js", "./dist/mod.js"],
  "files": ["dist"]
}
```

`sideEffects` names the modules that call `customElements.define`, so a
bundler keeps the registration when the consumer imports only types. The
class is defined in the same module that declares it, as Lit's publishing
guide requires.

## 4. Engine: the `geometry` module

`toSvg` in `packages/engine/engine.ts` computes, per piece, the polyline
points (starting at the head base), the head polygon (arrow or sharpened
stick, with or without the collar), and the tail circle. That arithmetic
moves to `packages/engine/geometry.ts`:

```ts
export type Dir = { dx: number; dy: number; ch: string }
export const DIRS: readonly Dir[]            // moves here; engine.ts re-exports it

export interface ShapeOptions {
  cell: number        // size of one cell in output units
  pad: number         // margin before the first cell, in output units
  width: number       // stroke width of this piece, in output units
  headWidth: number   // 0 = automatic, else in cells
  headHeight: number  // 0 = automatic, else in cells
}

export interface PieceShape {
  line: [number, number][]   // polyline points: head base first, then cells 1..n
  head: [number, number][]   // polygon: tip, side, (collar, collar), side
  tail: { x: number; y: number; r: number }
}

export function pieceShape(piece: Piece, o: ShapeOptions): PieceShape
export function voidStrips(board: Board): { x: number; y: number; w: number }[]  // in cells
```

`toSvg` calls `pieceShape` with its `cell`, `pad = cell` and the piece's
stroke width, and formats the numbers exactly as today (`${x},${y}` joined by
spaces). The element calls it with `cell = 1`, `pad = 0`.

Byte identity of `toSvg` is a hard requirement: the CLI's byte-for-byte test
against the engine, the pinned fingerprints and the README images all depend
on it. The extraction keeps the order of floating-point operations, and a new
Deno test pins SHA-256 hashes of `toSvg` output for four boards and option
sets (`defaults`, `skeleton 100×200 top 5`, `colored`, `voids` on a jammed
board), computed on `main` before the change and committed as
`packages/engine/svg-golden.json`.

Other engine changes: `mod.ts` exports the module; `neutral.test.ts` adds
`geometry.ts` to `NEUTRAL`; `tsconfig.build.json` adds it to `include`;
`package.json` of the engine gets `sideEffects: false` (deferred in step 1
until a bundler consumer appeared).

## 5. Element API

Tag `arrowz-board`, class `ArrowzBoard extends LitElement`, shadow DOM.

### Properties

| Property | Type | Default | Attribute |
|---|---|---|---|
| `board` | `Board \| null` | `null` | none (object) |
| `view` | `Partial<BoardView>` | `{}` | none (object) |
| `interactive` | `boolean` | `false` | `interactive` (reflected) |
| `lang` | `string` | `''` | `lang` (standard global attribute) |

```ts
export interface BoardView {
  stroke: number       // stroke width as a fraction of a cell, 0.5
  headWidth: number    // 0 = automatic, else cells
  headHeight: number   // 0 = automatic, else cells
  colored: boolean     // per-piece hues, the diagnostic mode of the lab
  top: number          // number of longest pieces drawn highlighted and on top
  voids: boolean       // draw the cells the generator failed to carve
  ink: string          // '#232447'
  paper: string        // '#f6f6fa'
  highlight: string    // '#e8467c'
}
```

Missing `view` fields take the defaults above, which are the CLI's defaults.
`cell` is deliberately absent: the element's scale is the viewport's business.

### Methods

| Method | Behaviour |
|---|---|
| `animateExit(pieceId, dir): Promise<void>` | slides the piece off the board along `dir` (0 up, 1 right, 2 down, 3 left) while fading; removes its node when done; resolves then |
| `shake(pieceId, distance): Promise<void>` | nudges the piece `distance` cells along its own direction and back; resolves when back |
| `fit(): void` | fits the whole board into the host |
| `zoomBy(factor): void` | scales around the centre of the host, clamped |
| `get viewport(): BoardViewport` | read-only snapshot `{ cellPx, originX, originY, fitted, hostWidth, hostHeight }` |

Unknown piece ids resolve immediately without drawing anything: the game may
issue an effect for a piece a previous effect already removed. A second
animation on a piece still animating cancels the first (its promise resolves
too). With `prefers-reduced-motion: reduce` every duration is zero, so
promises resolve on the next frame.

### Events

Both `bubbles: true, composed: true`, so they cross the shadow root and can
be delegated.

| Event | `detail` | When |
|---|---|---|
| `piece-click` | `{ pieceId: number }` | `interactive` is true and a click lands on a piece (§8) |
| `viewport-change` | `BoardViewport` | the viewport changed; at most once per animation frame |

Types `PieceClickEvent` and `ViewportChangeEvent` (as `CustomEvent<...>`)
are exported, and `HTMLElementTagNameMap` and `HTMLElementEventMap` are
augmented so `document.createElement('arrowz-board')` and
`addEventListener('piece-click', …)` are typed.

### Board updates

Setting `board` when `W` or `H` differ from the drawn board, or when no board
was drawn, rebuilds the SVG layer. Otherwise the layer diffs by piece id:
nodes whose id is gone are removed, ids that are new are appended, and a node
is kept only if the `Piece` object is the very same reference as the one it
was built from; a different object under the same id is rebuilt. The game
reducer removes pieces by filtering the array, so its next board reuses every
remaining piece object and the update costs one pass over ids; a fresh board
of the same size from the lab has new objects and rebuilds, as it should.

In the diagnostic modes (`colored` or `top > 0`) a board change always
rebuilds, because the hues and the highlighted set depend on the whole piece
list, not on one piece.

Changing `view` rebuilds the layer (stroke and heads change every path).
Changing `interactive` or `lang` touches only the chrome and the cursor.

## 6. Rendering

Coordinates are in **cells**: the centre of cell `(x, y)` is `(x + 0.5,
y + 0.5)`, the board occupies `[0, W] × [0, H]`, a stroke of `0.5` is half a
cell wide. Zoom and pan are the `viewBox` of the root `<svg>`:
`viewBox="originX originY hostWidth/cellPx hostHeight/cellPx"`. Because the
viewport keeps the `viewBox` aspect equal to the host's, `preserveAspectRatio`
never has to letterbox. The `<svg>` fills the host (`display: block; width:
100%; height: 100%`) and has `touch-action: none`.

Structure:

```
<svg viewBox=…>
  <rect class="paper" x=0 y=0 width=W height=H fill=paper/>
  <g class="voids" fill=highlight fill-opacity=.22> <rect …/> … </g>        (view.voids only)
  <g class="pieces" fill="none" stroke=ink stroke-width=stroke stroke-linecap="butt" stroke-linejoin="round">
    <g data-id="17"> <polyline points=…/> </g> …
  </g>
  <g class="top" …thicker stroke…> <g data-id=…> … </g> </g>                (view.top only)
  <g class="heads" fill=ink> <g data-id="17"> <polygon/> <circle/> </g> … </g>
</svg>
```

The layering mirrors `toSvg` (lines, then highlighted lines, then all heads
on top), so the board looks the same as the CLI export. A piece therefore
owns two `<g data-id>` nodes, one in `pieces` (or `top`) and one in `heads`;
the id map holds both and the animations move both. Colour and stroke
overrides are per-piece attributes only for coloured and highlighted pieces,
exactly as in `toSvg`, so a monochrome Insane board carries no per-piece
attributes.

The markup is produced as one string per group and assigned once; the id map
is filled from the resulting children in a single pass. No Lit template
touches these nodes.

## 7. Viewport math (`viewport.ts`, pure)

```ts
export interface ViewportInput { W: number; H: number; hostWidth: number; hostHeight: number }
export interface Viewport extends ViewportInput { cellPx: number; originX: number; originY: number; fitted: boolean }
export const MAX_CELL_PX = 48
export function fit(v: ViewportInput): Viewport
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport
export function panBy(v: Viewport, dxPx: number, dyPx: number): Viewport
export function resize(v: Viewport, hostWidth: number, hostHeight: number): Viewport
export function screenToCell(v: Viewport, px: number, py: number): Cell | null
export function viewBox(v: Viewport): string
```

Rules, all from the game design §11:

- `fit` sets `cellPx = min(hostWidth / W, hostHeight / H)` and centres the
  board on the axis with slack (that axis gets a negative origin).
- `cellPx` is clamped to `[fitCellPx, MAX_CELL_PX]`; if the fit scale already
  exceeds 48 px per cell (a tiny board in a big host), the upper bound is the
  fit scale, so `fit` is always reachable.
- `zoomAt` keeps the world point under `(px, py)` fixed, then clamps.
- Clamping keeps the board inside the view: on an axis where the board is
  larger than the view, `origin ∈ [0, size − view]`; where it is smaller, the
  board is centred.
- `resize` refits when `fitted` is true, otherwise keeps `cellPx` and clamps.
- `fitted` is true exactly when `cellPx` equals the fit scale and the origin
  is the fit origin.
- `screenToCell` returns `null` outside the board.

## 8. Input (`gestures.ts` pure, wired in `arrowz-board.ts`)

The element listens on the `<svg>` only: `pointerdown`, `pointermove`,
`pointerup`, `pointercancel` (with pointer capture), `wheel`, `dblclick`,
and on the host `keydown`. Hit-testing is `screenToCell` → `board.owner[y·W + x]`
→ piece id, with no listeners on pieces.

Decisions, from the game design §11:

| Input | Effect |
|---|---|
| mouse press and release without ⌘/Ctrl, same piece under both | `piece-click` (only when `interactive`) |
| mouse press and release without a modifier, different piece or moved off | nothing |
| mouse drag with `metaKey \|\| ctrlKey` | pan |
| wheel, with or without Ctrl/⌘ | zoom towards the cursor, `preventDefault` (browser zoom must not fire) |
| one finger drag beyond 8 CSS px | pan |
| one finger tap within 8 px and 300 ms | `piece-click` |
| two fingers | pinch zoom towards the midpoint, plus pan by the midpoint's movement |
| double click, double tap (two taps within 300 ms and 24 px) | `fit()` |
| keys `+` or `=`, `-`, `0` (host focused) | `zoomBy(1.25)`, `zoomBy(1 / 1.25)`, `fit()` |
| buttons `+`, `−`, fit in the corner | the same three |

The wheel factor is `exp(−deltaY · 0.0015)` per event; trackpads deliver
many small deltas and mice few large ones, and the exponent keeps both smooth.
Pieces currently exiting are ignored by hit-testing. The cursor is `pointer`
over a piece when `interactive`, `grabbing` during a pan, default otherwise.
Platform detection serves only the hint text: `navigator.platform` containing
`Mac` selects the ⌘ wording, everything else Ctrl; the modifier check itself
is `metaKey || ctrlKey` with no platform branch.

The host is focusable (`tabindex="0"` added unless the consumer set one) and
shows a `:focus-visible` outline. The corner buttons are real `<button>`s
with `aria-label` and `title` from the dictionary, so the zoom is reachable
without a wheel and without gestures. On `pointer: coarse` devices the pan
hint is hidden, since there is no modifier to hold.

A `ResizeObserver` on the host feeds `resize`; until the host has a size, no
`viewBox` is written and no `viewport-change` is emitted.

## 9. Animations (`svg-layer.ts`)

Web Animations API on the two `<g data-id>` nodes of a piece, through the
CSS `transform` property. On SVG elements a CSS `px` in `translate()` is one
user unit, so `translate(3px, 0)` moves a piece three cells regardless of the
zoom.

| Effect | Motion | Duration |
|---|---|---|
| exit | translate along `dir` by (distance from the head to the board edge + piece length + 1) cells; opacity 1 → 0 | 320 ms, ease-in |
| shake | translate `distance` cells along the piece's own direction, then back | 90 ms out, 140 ms back, ease-out |

After `exit` finishes the nodes are removed and the id leaves the map; the
consumer's next `board` no longer lists the piece, so the diff finds nothing
to do. `shake` leaves the piece where it was. Durations are zero under
`prefers-reduced-motion: reduce`. A rebuild of the layer cancels running
animations and resolves their promises.

## 10. Localisation (`i18n.ts`)

```ts
export type BoardLang = 'en' | 'pl'
export interface BoardLabels { zoomIn: string; zoomOut: string; fit: string; panHintMac: string; panHintOther: string }
export const BOARD_LABELS: Record<BoardLang, BoardLabels>
```

English is the source, Polish the translation, per the repository rule. The
element reads its own `lang` attribute (not the inherited document language,
which `HTMLElement.lang` does not expose) and falls back to `en`. A Node test
asserts both dictionaries have the same keys and no empty strings.

## 11. Demo and measurement

`packages/board-element/demo/` on Vite: a preset picker fed from
`@arrowz/engine/presets`, generation in a worker importing `@arrowz/engine`,
one `<arrowz-board interactive lang="pl">`, and a panel with the numbers to
record:

- build: time from `board` assignment to the first paint (`performance.now`
  around the assignment plus one animation frame),
- pan: mean and worst frame time over 60 frames of a scripted pan,
- zoom: the same over 60 frames of a scripted zoom,
- node count of the SVG.

Measured on the reference machine at Nightmare 100×100 (Nightmare preset)
and Insane 1000×1000 (Insane preset); Insane takes ~16 s to generate, so it
is measured by hand, not in CI. The numbers go into this document's §15 and
into `packages/engine/HISTORY.md` when the implementation lands. Acceptance
for keeping SVG as is: Nightmare pans at frame time under 16 ms; Insane under
50 ms with build time under 5 s. Failing that, the next step is a spec for
virtualisation or Canvas, and the per-piece `<g>` is removed first.

The demo also exercises `animateExit` and `shake` on click, so the visual
check of the effects does not need the game.

## 12. Tests and verification

Node project of Vitest (`src/*.test.ts`):

- `viewport.test.ts`: fit and centring, cursor point preserved under zoom,
  lower and upper bounds, the board never escapes the view, resize refits
  only when fitted, `screenToCell` on and off the board.
- `gestures.test.ts`: the table of §8 as intents (click, pan, pinch, tap,
  double tap, cancelled click on movement, modifier drag).
- `i18n.test.ts`: dictionary completeness.

Chromium project (`src/*.browser.test.ts`), real DOM, real SVG:

- renders the piece count and the void strips of a small generated board;
  the `viewBox` after mount equals `fit`,
- `piece-click` fires with the right id, does not fire without `interactive`,
  on a modifier drag, or when release lands on another piece,
- wheel and buttons change the `viewBox`; keys work when focused,
- events cross the shadow root (listener on `document`),
- `animateExit` resolves and removes the nodes, `shake` resolves and keeps
  them, unknown ids resolve,
- diff: a board minus one piece reuses the other nodes (same node identity),
  a fresh same-size board rebuilds,
- Nightmare 100×100 generated in the test builds within 5 s and its 20-frame
  pan completes; the durations are printed, not asserted, so CI stays green
  on slow runners.

Engine (Deno): `geometry.test.ts` (arrow versus stick heads, collar and no
collar, void strips), the `svg-golden.json` hashes, `neutral.test.ts` over
`geometry.ts`. The existing byte-for-byte CLI test and the fingerprints keep
guarding the export.

## 13. Nx, Deno and CI

`project.json` targets: `check` (`tsc -p tsconfig.json --noEmit`), `lint`
(`deno lint`), `fmt` (`deno fmt --check`), `test` (`vitest run`, `dependsOn:
["^build"]` so the engine's `dist/` exists), `build` (`tsc -p
tsconfig.build.json`, cached, output `dist/`), `serve` (`vite`, not cached),
`verify` (noop over check, lint, fmt, test, build). `nx.json` gets the
`serve` default and nothing else; `pnpm nx run-many -t verify` and
`nx affected` pick the project up through `pnpm-workspace.yaml`.

Root `deno.json`: `exclude` and `fmt.exclude` gain `**/node_modules/`,
because pnpm creates `packages/board-element/node_modules` and the current
`node_modules/` pattern covers only the root. Root `deno task check` and
`deno task test` stay Deno-only; the Deno root tasks are not the full
verification, `pnpm nx run-many -t verify` is.

CI (`.github/workflows/ci.yml`): after `pnpm install`, a step
`pnpm exec playwright install --only-shell chromium` with
`actions/cache` on `~/.cache/ms-playwright` keyed by the Playwright version
from the lockfile. Installing when `board-element` is not affected wastes
under a minute with a warm cache; a conditional install would need the
affected list before the install step, which is not worth the complexity.

Editor: `.vscode/settings.json` keeps `deno.enablePaths` at the two Deno
packages; the new package is checked by the TypeScript server through its
`tsconfig.json`.

## 14. Out of scope

- a React wrapper (`@lit/react`) and any framework adapters,
- Canvas or virtualised rendering (only after the measurement of §11),
- hover highlight, selection, keyboard navigation between pieces,
- server-side rendering of the element,
- moving the old Deno lab in `packages/cli` onto the element (it stays until
  the React lab reaches parity, per the road map),
- publishing to npm or JSR,
- any change to generator behaviour.

## 15. Risks and measurements

- **Insane in SVG.** Unknown until measured; the acceptance numbers and the
  fallback order are in §11. Recorded here once measured: *(pending)*.
- **Vitest 5.0.0 is days old.** If browser mode misbehaves, pin Vitest 4.1
  with the matching `@vitest/browser-playwright`; the configuration is the
  same shape.
- **Byte identity of `toSvg`.** Guarded by four golden hashes, the CLI test
  and the fingerprints; the extraction must preserve the order of arithmetic.
- **Deno lint and fmt over a Node package.** Both are syntactic and do not
  resolve `lit`; if a rule fires on browser globals, the rule is disabled per
  file, not the package excluded, so one formatter governs the repository.
- **Pointer events on iOS Safari.** Pinch relies on two active pointers with
  `touch-action: none`; the demo on a phone is the check, and the fallback is
  `touchstart`/`touchmove` listeners for the pinch path only.
