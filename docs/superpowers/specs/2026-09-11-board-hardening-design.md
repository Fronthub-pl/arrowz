# Board hardening, and a drag that pans

Date: 2026-09-11. Status: draft design, awaiting review.

Baseline: `feat/rounded-arrows` at `0a14e7a` (PR #34, draft, on top of PR #33).
Neither is on `main` yet, and most of what follows is about code only they
carry (the WebGL layer, the corner chrome), so this work branches off #34.
Builds on `docs/superpowers/specs/2026-09-09-board-element-design.md` §8 (input)
and `docs/superpowers/specs/2026-09-10-webgl-board-layer-design.md` (the
layer's context life cycle). The engine is not touched.

## 1. Why

A sweep of the demo (`pnpm nx serve board-element`, driven live in Chrome at
devicePixelRatio 1, window 1920×1953) turned up the following. Every item was
reproduced on the page, not inferred from the code.

1. **A board goes blank for good when another board takes its WebGL context.**
   `GlLayer` acquires its context in its constructor, which the element runs
   from its own constructor. Sixteen `document.createElement('arrowz-board')`
   calls, never connected, evicted the visible board's context (Chrome allows
   about sixteen). `onLost` default-prevents the loss, but nothing ever asks
   for the context back while the board stays connected: `restore()` is only
   called from `connectedCallback`. Calling `layer.restore()` by hand revived
   it at once, so the machinery is sound; only the trigger is missing.
2. **The board sticks to the cursor after a lost `pointerup`.** After a
   modifier drag whose release never arrives (a context menu, a window switch),
   plain moves with no button held keep panning: `gestures.panning` stays true.
   The element has no `lostpointercapture` listener either.
3. **The board takes the browser's zoom shortcuts.** `onKeyDown` does not look
   at modifiers, so with the board focused — and a click focuses it —
   ⌘/Ctrl + `-`, `+`, `0` are default-prevented and page zoom stops working. The
   same keys are also swallowed on an empty board, where the wheel deliberately
   is not.
4. **Nonsense numbers draw nonsense, silently.**
   - `pad="abc"` gives a viewport of `NaN`s. The board vanishes, and
     `viewport-change` hands the consumer `NaN`.
   - `view.stroke: NaN` draws nothing; `view.headHeight: NaN` breaks the
     geometry apart; `stroke: 5` floods the paper with ink.
   - A `point-radius` of 0.5 or more, or `NaN`, floods the paper with dots.
     `NaN` in `smoothstep` is undefined in GLSL, so another GPU may draw
     something else again.
   - An invalid CSS colour becomes black.
5. **The host's height depends on its history.** The canvas is in flow with
   `height: 100%`, so a host whose height is not definite takes the canvas's
   intrinsic aspect ratio, and the canvas is sized to the host. After a host of
   20×3000, clearing the inline style left it 1525×228 750. The demo relies on
   this without meaning to: `arrowz-board { height: 100% }` sits in a `main`
   of undefined height, and the host came up 2009 px tall in a 1953 px window.
6. **A touch pointer that never ended turns every later tap into a pinch.**
   Nothing is clicked until a `pointercancel` for the stale id arrives.
7. **The demo opens on an empty board** until Generate is pressed.

Checked and sound: swapping the board and calling `restart()` in the middle of
exit animations (no errors, no pending promises, no riders left in the layer);
disconnecting and reconnecting (the picture comes back); hosts of 0 and 1 px
and of extreme aspect ratios.

And one change of behaviour, asked for by the user: **on the desktop a plain
drag pans, and a ⌘/Ctrl click plays**, with a switch back to today's rule for
players who prefer it.

## 2. Rulings I made

- **Only the player switches the gesture mode.** There is no attribute: the
  switch is a button in the corner, and the choice is remembered by the element
  in `localStorage`. (Asked; this was the user's answer.)
- **In the new mode a plain click does nothing.** Only a ⌘/Ctrl click plays, so
  a hand that twitches while panning never costs a life. (Asked.)
- **Touch does not change.** Tap plays, one finger pans, two pinch. The switch
  governs mouse and pen only, and is hidden on `pointer: coarse`. (Asked.)
- **A board that cannot be played is always in the new mode, and shows no
  switch.** Without `play` or `interactive` a click does nothing either way, so
  there is only panning to choose, and a plain drag is the better way to pan.
- **Boards on one page do not follow each other live.** Each reads the stored
  choice when it connects. Keeping several boards in step within a page is
  machinery nobody has asked for.
- **Validation corrects only what cannot be drawn, not what is ugly.** The
  demo's slider ranges (stroke 0.2–0.9 and so on) are a UI's opinion; a
  consumer may want a stroke of 1. The element's bounds come from the
  geometry (a stroke wider than a cell, a dot wider than half a cell), and it
  corrects silently: no console warning.
- **The host is sized by its consumer.** With the canvas out of flow the host
  has no height of its own, exactly like a `<div>`. There is no default
  `min-height`.
- **The main-thread cost of rebuilds on Insane is a separate piece of work.**
  The sweep measured 220–500 ms per view change, 369 ms for `restart()` and
  724 ms for `loadState()` on 1000×1000. Moving the tesselation off the main
  thread, or slicing it, is a change to the layer's architecture, and gets its
  own design.

## 3. Decisions

| Topic | Decision |
| --- | --- |
| Gesture modes | `'drag'` (default) and `'click'` (today's rule) |
| Where the mode's rule lives | `GestureMachine`, as a parameter; tested as two tables in Node |
| Mode switch | a toggle button in the corner chrome, `aria-pressed`, shown only with `play` or `interactive` on a fine pointer |
| Persistence | `localStorage['arrowz-board.gestures']`, `'drag'` or `'click'`, guarded by `try`/`catch` |
| Public API | a read-only `gestureMode` getter; no attribute, no event |
| Context acquisition | on the first connect, not in the constructor |
| Context taken by the browser | ask for it back as soon as the board is visible (`IntersectionObserver`) |
| Lost release | a mouse or pen move with no button pressed ends the gesture; `lostpointercapture` cancels it |
| Keys | ignored with ⌘, Ctrl or Alt; not default-prevented without a viewport |
| Validation | pure `src/sanitize.ts`, applied on the way to the layer and the viewport; properties keep what the host set |
| Layout | canvas `position: absolute; inset: 0` |
| Ghost touch | a primary touch going down drops every other touch the machine holds |

## 4. Gestures

### 4.1 The two modes

| Mode | drag, no modifier | click, no modifier | ⌘/Ctrl click | ⌘/Ctrl drag |
| --- | --- | --- | --- | --- |
| `drag` (default) | pan | nothing | play | nothing |
| `click` (today) | nothing | play | nothing | pan |

"Play" is today's click path: `piece-click`, then the reducer when `play` is
set. "Nothing" is what the machine already returns for a release that ends a
pan, so the new rule needs no new threshold. The mode is the only thing that
changes which key pans:

```ts
export type GestureMode = 'drag' | 'click'
// in down(), for mouse and pen:
this.isPanning = p.modifier !== (this.mode === 'drag')
```

`GestureMachine` takes the mode in its constructor and through a `mode`
setter. A change of mode mid-press applies from the next press. Touch ignores
the mode.

### 4.2 macOS and Ctrl-click

On macOS, Ctrl-click is a secondary click: Chrome delivers `pointerdown` with
`button === 0` and `ctrlKey`, then a `contextmenu`. In `drag` mode that press
is a play press, so the element default-prevents `contextmenu` on the canvas
when `ctrlKey` is set. The hint on a Mac names ⌘ anyway.

### 4.3 Cursors and hint

- In `drag` mode the canvas shows `grab` over the board, `pointer` over a piece
  only while the modifier is held (the window key listeners of today, with
  their meaning turned around), and `grabbing` during a pan.
- `click` mode keeps today's cursors.

The hint follows the mode and the platform:

| Mode | Mac | Other |
| --- | --- | --- |
| `drag`, playable | Drag to pan · ⌘-click to play | Drag to pan · Ctrl-click to play |
| `drag`, not playable | Drag to pan | Drag to pan |
| `click` | Hold ⌘ and drag to pan | Hold Ctrl and drag to pan |

### 4.4 The switch

- A `<button class="gestures">` sits next to ◑, with `aria-pressed="true"` in
  `click` mode and a title and `aria-label` from the dictionary ("Click plays
  without ⌘" / "Klik gra bez ⌘"; Ctrl on other platforms).
- It is rendered only when `play || interactive`, and hidden under
  `@media (pointer: coarse)` like the hint.
- Pressing it flips the mode, writes it to storage, updates the machine and
  the hint.
- On connect the element reads storage; anything but `'drag'` or `'click'`,
  or a throw, means `'drag'`.

### 4.5 Dictionary

`BoardLabels` loses `panHintMac` and `panHintOther` in favour of:

- `dragHint` and `dragPlayHintMac` / `dragPlayHintOther`;
- `clickHintMac` / `clickHintOther`, today's two strings;
- `gesturesMac` / `gesturesOther`, the switch's label.

English and Polish both; the key-parity test covers them.

## 5. The context life cycle

- **Acquire on connect.** The constructor creates only the canvas.
  `connectedCallback` already calls `layer.restore()`, and for a layer that
  never had a context — no context, no loss — that falls through to
  `onRestored → acquire`. The element's `hasWebgl` is read after that first
  connect, and the element re-renders if it came back false.
- **Taken by the browser.** The layer tells the element about a loss it did not
  cause (an `onContextLost` callback, fired from `onLost` unless `dispose` asked
  for it). While connected, the element then observes itself with an
  `IntersectionObserver`; the first entry that intersects calls
  `layer.restore()` and stops observing. A visible board comes back at once, a
  scrolled-away one when it is scrolled to. `disconnectedCallback` stops the
  observer.
- **Limit.** More than about sixteen boards visible at once will take each
  other's contexts in turn. That is the browser's ceiling. The spec records it,
  and the element does not work around it.

## 6. Pointer robustness

- `PointerSample` gains `pressed: boolean` (`(buttons & 1) !== 0`) and
  `primary: boolean` (`isPrimary`).
- `move()` of a mouse or pen sample that belongs to the current press and has
  `pressed === false` resets the machine and returns `none`. The release was
  lost; nothing is clicked.
- The element listens for `lostpointercapture` and calls `gestures.cancel(id)`,
  clearing the `panning` class.
- `down()` of a touch sample with `primary === true` first drops every other
  touch pointer the machine holds. The browser marks a touch primary only when
  no other touch is active, so any it still holds are stale.
- Synthetic pointer moves in tests and in the demo's Measure script must now
  carry `buttons: 1` while pressed.

## 7. Keys

`onKeyDown` returns at once when `metaKey`, `ctrlKey` or `altKey` is set, and
when there is no viewport. Otherwise it behaves as today.

## 8. Validation (`src/sanitize.ts`)

Pure, no DOM: the colour check is passed in as a predicate, so Node tests it
with a stub and the element passes `(c) => CSS.supports('color', c)`.

```ts
export function drawableView(view: BoardView, isColor: (c: string) => boolean): BoardView
export function drawablePad(pad: number): number
export function drawablePointRadius(r: number): number
```

| Field | Not finite | Out of range |
| --- | --- | --- |
| `stroke` | default | clamped to (0, 1]; 0 or less becomes the default |
| `headWidth`, `headHeight` | default | below 0 becomes 0 |
| `top` | default | floored, below 0 becomes 0 |
| `pad` | `DEFAULT_PAD` | below 0 becomes 0; no upper bound |
| `point-radius` | `DEFAULT_POINT_RADIUS` | clamped to [0, 0.5] |
| `ink`, `paper`, `highlight`, `point-color` | — | not a CSS colour: the field's default |

- The element applies these in `redraw()` (the merged view), in
  `syncViewport()` (pad) and in `updatePoints()` (radius, colour).
- The properties and attributes keep exactly what the host set, as `margin`
  already does for `pad`, so Lit never reflects a corrected value back.
- `viewport-change` can then never carry a `NaN`.

## 9. Layout

`canvas { position: absolute; inset: 0; }`, under the existing
`:host { position: relative; }`. The host has no intrinsic size. The element's
§8 note and the README say that the consumer sizes it. The demo gives `main` a
definite height: the grid gets `grid-template-rows: 100%`.

## 10. Demo

- The demo generates the selected preset once on load.
- The Measure script carries `buttons: 1` on its moves.
- In `drag` mode it pans without `ctrlKey`; the script reads `gestureMode` and
  sets the modifier to match.

## 11. Tests

Node:

- `gestures.test.ts`, run as two tables, one per mode:
  - drag without a modifier pans, and a plain click does nothing in `drag`;
  - a modifier click plays in `drag`;
  - today's rows are unchanged in `click`.
- `gestures.test.ts`, independent of the mode:
  - a move with `pressed: false` ends the press, and a later release clicks
    nothing;
  - a primary touch drops a stale one, so the tap clicks;
  - touch rows are identical in both modes.
- `sanitize.test.ts`: every row of the table in §8.
- `i18n` key parity, with the new keys.

Browser (`arrowz-board.browser.test.ts`, `gl-layer.browser.test.ts`):

- **Orphans:** twenty elements created and never connected leave a connected
  board's context alive.
- **Forced loss:** a loss forced through `WEBGL_lose_context` on a visible,
  connected board comes back without a reconnect. A loss on a board outside
  the viewport comes back once it is scrolled in.
- `lostpointercapture` mid-pan clears `panning`, and a following plain move
  does not pan.
- ⌘/Ctrl + `-`, `+`, `0` are not default-prevented; the plain keys still zoom.
  Without a board, no key is default-prevented.
- **Layout:** a host resized to 20×3000 and then back to an auto height inside
  a definite parent returns to that parent's height.
- **Switch:**
  - present with `play`, absent without;
  - flips `aria-pressed`, the hint and `gestureMode`;
  - persists across a new element;
  - a garbage stored value reads as `drag`.
- **Validation:** `pad="abc"` keeps the fitted viewport of the default pad, and
  no `viewport-change` detail holds a non-finite number.
- **Existing tests** that drag with `ctrlKey` are rewritten for the new
  default, or pin `click` mode through storage.

## 12. Verification

- `deno task verify` in `packages/engine` still passes: the engine is not
  touched, so `fingerprints.test.ts` must pass unchanged.
- `pnpm nx run-many -t verify` passes.
- In the demo:
  - a plain drag pans and a plain click does nothing;
  - ⌘-click plays, and on a Mac Ctrl-click plays without a context menu;
  - the switch restores today's rule and survives a reload;
  - 16 orphans leave the board drawn;
  - Insane pans at the figure of the WebGL spec (about 34 ms).

## 13. Out of scope

- The main-thread cost of rebuilds on Insane (§2, last ruling).
- Keeping several boards on one page in step when one switches mode.
- Working around the browser's ceiling of live contexts.
- An attribute for the gesture mode.

## 14. Risks

- **macOS Ctrl-click.** Default-preventing `contextmenu` is expected to keep the
  press and its release intact, but no test can issue a native Ctrl-click.
  It is checked by hand in the demo.
- **`IntersectionObserver` restores.** With many boards visible, restores can
  evict each other in a cycle. The limit is documented (§5), and the restore
  runs once per intersecting entry, not in a loop.
- **Synthetic pointer events.** Every existing test that drags must now send
  `buttons: 1`, or the new lost-release rule will end its gesture. A test that
  fails this way fails loudly (no pan), not silently.
