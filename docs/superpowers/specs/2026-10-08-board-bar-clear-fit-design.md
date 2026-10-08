# The board's own bar keeps clear of the fitted board — design

Bead: `arrowz-6ce`.

`<arrowz-board>` draws its control bar (`.chrome`: the hint, `+`, `−`, `⤢`,
and `◑` and `☝` when enabled) in the host's bottom-right corner, 8 px from both
edges, over the canvas. `fit()` knows nothing about it: the board is fitted
into the whole host with a margin of `pad` cells, widened to at least
`MIN_PAD_PX` (16 px). A tall board in a narrow host keeps a wide blank beside
it but only 16–30 px under it, and the bar is 40 px tall with its offset, so
it lies over the board's bottom-right cells. At fit those cells cannot be
reached: the view does not pan at the fitted scale.

Measured on `d8b3636` over the real lab (`App`, default 25×50 board, the
element's bar in its shadow root, view and play mode, pointer fine and coarse):

| Window | Drawn cells under the bar |
| --- | --- |
| 375×812 | `+` over 32×9.6 px; in play 32×12.9 |
| 375×667 | up to 24×20 px (coarse), the hint up to 78×13 (fine) |
| 414×896 | `+` over 32×3.8–7.1 px |
| 1024×768, drawer open | `+` over 30×10 px; the play hint over 104×7 |
| 375×540 (coarse), 600×900, 768×1024, 924×540, 1440×900 | none |

The lab's `board-cover` invariant checks only the lab's own overlays, so none
of this is red today.

The lab cannot fix it alone: the only margin it controls is `pad`, a view
setting that goes into the printed command and the SVG, and any other page
with a tall board in a narrow host has the same defect. The element fixes it.

## 1. What changes for a page using the element

When the element shows its default bar and, fitted the usual way, the bar
would lie over the drawn board, the fit keeps a wider margin: wide enough
that the margin under the board is at least the bar's height plus its 8 px
offset. When the bar lies clear of the board, nothing changes, to the pixel.

- The margin stays one number, kept on all four sides. The board stays
  centred, the pan bounds and the paper follow the margin as they do today,
  and a leaving arrow is still clipped to the margin's outer edge (which now
  lies further out on such a board).
- A host that fills its own `controls` slot gets no reservation: the element
  does not know where a custom bar is placed. The README says so.
- `pad = 0` stays edge to edge: asking for no margin is not asking for one
  sized to the bar. A page that wants `pad = 0` and an unobstructed board
  hides the bar with an empty custom `controls`.
- Nothing new in the API: no attribute, no property, no event. `viewport`
  reports the fitted scale as before, and `margin` in the internal
  `Viewport` is the margin kept.

What it costs where it applies: at 375×812 the cell goes from 7.6 px to about
7.2 px. Reserving the bottom only and moving the board up would keep about
7.4 px, but it splits the one margin into two and changes the pan bounds; not
worth 0.2 px.

It applies to more than tall boards: whenever the margin under a fitted board
is shorter than the bar. A sketch of this design run before the plan showed:

- the element's own test fixture, a 30×30 board in a 300×300 host with the
  default `pad`, collides (a 31.6 px margin under a 40 px bar): its fit goes
  from 7.89 to 7.33 px a cell;
- the lab's Docs at 1440×900 change no board; at 375×812 the three 8×6 rule
  boards on the Arrowz page shrink, by about 6% under a finger (one row of
  buttons) and by 41% with a mouse, where the play hint wraps the bar to
  several rows;
- with `board-cover` extended to the bar, 45 cases of the lab's layout matrix
  are red today (among them `violations` at 1440×900 and 1280×800), and all
  are green with the fit reserving room.

## 2. The viewport (`viewport.ts`)

`ViewportInput` gets an optional field:

```ts
/** The default bar's box from the host's bottom-right corner, offset included, in CSS px; absent when the element shows none. */
bar?: { width: number; height: number }
```

`Viewport` extends `ViewportInput`, so it carries `bar` like `pad`; `clamp`
builds its result field by field and copies `bar` with the others.

`marginOf` keeps its three candidates and adds a fourth, used only on a
collision:

1. Compute the margin as today, `m0 = max(pad, byWidth, byHeight)`, and the
   scale `s0` it fits at.
2. The fitted board at `s0` spans, from the host's top-left,
   `right = (hostWidth + W·s0) / 2` and `bottom = (hostHeight + H·s0) / 2`.
   The bar spans `hostWidth − bar.width … hostWidth` and
   `hostHeight − bar.height … hostHeight`.
3. If `right > hostWidth − bar.width` and `bottom > hostHeight − bar.height`
   (each by more than half a pixel, so rounding never triggers it), add `byBar = R·H / (hostHeight − 2R)` with
   `R = bar.height`, the same closed form `MIN_PAD_PX` uses, so nothing is
   searched and the result cannot oscillate. If `hostHeight ≤ 2R` the host is
   too short for any reservation and there is none.
4. Otherwise the margin is `m0`.

With `pad ≤ 0` the margin stays 0 and the bar is not consulted.

`byBar` is in cells and fits both axes, so when the width binds the scale the
margin under the board is wider still; the reservation holds either way. The
collision test is on the scale before the reservation: the reservation only
shrinks the board towards the centre, so it cannot create a collision it then
has to undo.

`fitScale`, `clamp`, `zoomAt`, `panBy`, `fit` and `resize` read the margin
through `marginOf` already, so they follow without change. One new export:

```ts
/** The same view with another bar: refitted when it was fitted, bounded otherwise. */
export function withBar(v: Viewport, bar: ViewportInput['bar']): Viewport
```

It mirrors `resize`: a fitted view refits, a zoomed or panned one is only
clamped, so a bar that changes under a player's zoom never moves the board.

## 3. The element (`arrowz-board.ts`)

- The element measures its default bar. A second `ResizeObserver` on
  `.chrome` (the default content of the `controls` slot) reports its box;
  `bar` is `{ width: hostRight − chromeLeft, height: hostBottom − chromeTop }`,
  so the 8 px offset is included and a bar that wraps to two rows reports its
  full height.
- `bar` is `undefined` when the `controls` slot has assigned nodes, when the
  bar is not rendered (`display: none`, zero size), or before the first
  measurement.
- `syncViewport` passes `bar` with the rest of the input. A change of the
  bar's box calls `withBar` and `setViewport`. An unchanged box does nothing.
- On a fitted board a changed margin moves `cellPx`, so `sameViewport` sees
  the change. On a zoomed board `withBar` may change only the margin: the six
  numbers `sameViewport` compares stay equal, yet the paper (`layer.pad`,
  drawn to the margin kept) has moved. `setViewport` then asks the layer for
  a frame but sends no `viewport-change`: the consumer's numbers did not
  change.
- The bar changes size with the language, the mode hint (play shows a longer
  one), `enableColors`, `interactive`/`play`, and `pointer: coarse`, which
  hides the hint. All of these reach the observer; none needs its own code.

## 4. The lab

- `board-cover` (`harness/invariants.ts`) also checks the element's bar: the
  buttons and the hint inside `arrowz-board`'s shadow `.chrome`, rendered and
  of non-zero size, against the drawn board's box the check computes today.
- `LayoutInvariants` already runs `board` and the play states at 375×812 and
  1024×768. Following the file's rule, the check is extended first and the
  cases go red; the fix turns them green. One case is added: `board` at
  375×667, the size with the largest overlap measured.
- No lab CSS changes, and `pad` stays the user's setting.

## 5. Tests

`viewport.test.ts` (Node):

- a tall board in a narrow host with a bar that collides: the margin is
  `byBar`, the bottom margin in px is at least `bar.height`, and the board's
  box does not intersect the bar's;
- no collision (a wide board; a host with room, e.g. the 924×540 and
  1440×900 hosts measured above): the viewport equals the one without `bar`,
  field for field;
- `bar` absent: today's results, field for field;
- `pad = 0` with a colliding bar: margin 0;
- `hostHeight ≤ 2·bar.height`: no reservation;
- `withBar` on a fitted view refits; on a zoomed view it only clamps and
  keeps `cellPx`.

`arrowz-board.browser.test.ts` (Chromium):

- a 25×50 board in a 375×441 host (the lab's host at 375×812): no button or
  hint of the bar intersects the drawn board at fit;
- the same board in a wide host: `cellPx` equals today's;
- the bar's box changing while fitted (for example `lang` from `en` to `pl`,
  or `play` on) refits; after `zoomBy(2)` it does not move the view;
- a custom `controls` slot: no reservation, `cellPx` equals the fit without a
  bar.

The lab: `LayoutInvariants` as in section 4.

## 6. Documentation

- `packages/board-element/README.md`, "The margin": a paragraph saying the
  fit widens the margin when the default bar would cover the board, that a
  custom `controls` bar gets no such room, and that `pad = 0` stays edge to
  edge. "Slots and custom controls": one sentence pointing there.
- `apps/lab/docs-content/{en,pl}/element.md`, `## The margin {#margin}`: the
  same paragraph in both languages.
- Strings the README guards check are left as they are; any new symbol named
  in the README is exported or the guard says so.

## 7. Out of scope

- A custom `controls` bar placed over the board (the page owns its layout).
- Moving the default bar, shrinking its buttons, or a setting to hide it.
- The lab's own overlays: `board-cover` covers them already.
- Other pages, the lab's Docs boards among them: they get the change from the
  element with no code of their own.
