# Board controls through slots

`<arrowz-board>` draws its own controls today: the hint and the `+`, `−`, `⤢`,
`◑` and `☝` buttons are written into the shadow template, styled there, and
wired with one `@click` each. A host can switch `◑` on (`enable-colors`) and
`☝` on (`interactive` or `play`), and nothing else: no slot, no part, no
custom property reaches them.

This change lets a host supply any of those controls, or the whole bar, as
light DOM content projected into named slots. The element's own controls stay
as slot fallback content and are drawn only when the host supplies nothing.

One pull request, from `main` at `eb48ecc`.

## Goal

A host can replace one control, or the whole bar, with its own markup, and the
replacement behaves exactly like the control it replaces: same action, same
availability rules, same pressed state. A host that supplies nothing sees no
difference at all.

## Behaviour contract

With no slotted content the element renders, behaves and is labelled exactly as
before. The existing browser tests are the proof: they pass with no assertion
edits.

Unchanged: the wheel, the `+ − 0` keys, the gesture machine, `colored-change`
and its `preventDefault()` semantics, the default controls' `en`/`pl` labels,
the default controls' styles and position.

Out of scope: slot rows on the lab's `/docs` page (`ElementDocs.tsx`), custom
properties or `::part` for the default controls, any use of the slots in
`apps/lab` or in `packages/board-element/demo`.

## Slots

All slots are named; there is no default slot.

| Slot | Fallback | Present in the shadow tree when |
|---|---|---|
| `controls` | `.chrome` holding the five slots below | always |
| `hint` | `<span class="hint">` with the mode text | `controls` has no assigned nodes |
| `zoom-in` | `+` button | `controls` has no assigned nodes |
| `zoom-out` | `−` button | `controls` has no assigned nodes |
| `fit` | `⤢` button | `controls` has no assigned nodes |
| `colors` | `◑` button | `controls` has no assigned nodes and `enableColors` |
| `gestures` | `☝` button | `controls` has no assigned nodes and `interactive` or `play` |

The per-control slots live inside `controls`' fallback. A host that fills
`controls` therefore also switches the per-control slots off: a child with
`slot="fit"` next to a custom bar is not rendered. A custom bar replaces
`.chrome` together with its position; `:host` is `position: relative`, so the
host positions its bar against the board.

Under `@media (pointer: coarse)` the `hint` and `gestures` slots are
`display: none`, which hides fallback and slotted content alike. Inside a
custom `controls` the touch rule is the host's.

## Actions

`data-board-action` on a host element names the action a click on it (or on
anything inside it) performs:

| Value | Action |
|---|---|
| `zoom-in` | `zoomBy(ZOOM_STEP)` |
| `zoom-out` | `zoomBy(1 / ZOOM_STEP)` |
| `fit` | `fit()` |
| `colors` | `toggleColors()` |
| `gestures` | `toggleGestures()` |

It works in every slot, including arbitrarily deep inside a custom `controls`.
The name is namespaced because `data-action` is taken by common delegators
(Stimulus, Catalyst); a bare name would wire one click twice.

The default controls carry the same attribute and lose their own `@click`, so
the default and a host control run through one code path.

The element gives host controls no role and no label: the host supplies a
`<button>` and its accessible name. A host control that is not a button gets
the click action and nothing else.

## State the element owns on host controls

On every light-DOM `[data-board-action="colors"]` and
`[data-board-action="gestures"]` whose nearest `arrowz-board` ancestor is this
element:

- `aria-pressed`: `"true"`/`"false"` from `colored` and from `chosenMode === 'click'`;
- `hidden`: set on `colors` without `enableColors` and on `gestures` on a board
  that is neither `interactive` nor `play`, removed otherwise.

The element owns both attributes there; a value the host writes is
overwritten. In a per-control slot `hidden` changes nothing visible (the slot
is absent anyway); one rule for all host controls is simpler than two.

## Public API

New:

| Member | Behaviour |
|---|---|
| `toggleColors(): void` | what `◑` does, `colored-change` included; a no-op without `enableColors` |
| `toggleGestures(): void` | what `☝` does, storage included; a no-op on a board that is neither `interactive` nor `play`; fires `gestures-change` |
| `colored` (getter) | whether the board is drawn in colour now |

| Event | `detail` |
|---|---|
| `gestures-change` | `{ mode }`, `'drag'` or `'click'`; not cancelable; bubbles and composed; fired by `toggleGestures()` only, never by the storage read on connect |

The availability checks live in the public methods, not in the template, so a
call from code, a default control and a host control obey one rule. Today the
missing `◑` is the only thing that keeps an uncoloured board uncoloured, and
that would not hold on an API path.

`toggleColors` and `toggleGestures` are ordinary class methods, not arrow
fields: `publicMembers` in `packages/engine/lab-docs.test.ts` and the prototype
check in `docs-api.browser.test.ts` see prototype methods only.

## Inside the element

**Template.** `render()` builds the slot tree above. The default buttons keep
their classes (`colors`, `gestures`), their `labelsFor` labels and their
template-bound `aria-pressed`, and gain `data-board-action`.

**One click listener**, bound with `@click` on `<slot name="controls">`. A
click on fallback content reaches it because the slot is that content's DOM
parent; a click on slotted content reaches it because an assigned node's event
path runs through its slot and the slot's shadow ancestors. The handler walks
`event.composedPath()` from the target towards the slot and takes the first
element with `data-board-action`. Meeting another `arrowz-board` on the way
ends the walk with no action: that click belongs to the nested board. An
unknown value does nothing.

**`syncActions()`** (private) writes the state above on the host controls. It
runs:

1. from `updated()` when `enableColors`, `coloredOverride`, `view`,
   `chosenMode`, `play` or `interactive` changed;
2. from a `MutationObserver` on the host (`childList`, `subtree`,
   `attributeFilter: ['data-board-action', 'slot']`), observed in
   `connectedCallback` and disconnected in `disconnectedCallback`.

The observer, not `slotchange`, because a framework that replaces a node deep
inside an already assigned bar changes no assignment and fires no
`slotchange`. The filter leaves out `aria-pressed` and `hidden`, the two
attributes `syncActions()` writes, so its own writes never wake it.

**Errors.** No path throws. An unknown action, a click before there is a
viewport (`zoomBy` and `fit` already return then) and an unavailable action
(the method guards) all end with no effect.

## Documentation

- `packages/board-element/README.md`: a "Slots and custom controls" section
  (slot table, `data-board-action`, owned state, the nesting rule, the touch
  rule, accessibility on the host's side); the new rows in the method and
  event tables; `colored-change` described as fired by `◑` or `toggleColors()`.
- `packages/engine/lab-docs.ts`: three `ELEMENT_MEMBERS` rows, one
  `ELEMENT_EVENTS` row, and their `en` and `pl` texts (the guard requires both,
  and different).
- `packages/board-element/src/mod.ts`: `GesturesChangeEvent`,
  `GesturesChangeDetail`, and `'gestures-change'` in `HTMLElementEventMap`,
  which is where the engine's guard reads the event list from.

## Tests

Browser tests in `packages/board-element/src`. Each new test names, in the
plan, the mutation that turns it red and a negative control.

1. The existing tests pass unedited: three buttons, `button.gestures`, the
   `en`/`pl` titles.
2. A host button in `zoom-in` replaces the default: the default is not
   rendered and a click on the host button raises `cellPx`.
3. A custom `controls` replaces the whole `.chrome`; a `slot="fit"` child next
   to it is not rendered.
4. A host `colors` control is not rendered without `enable-colors` and is
   after it is set; likewise `gestures` with `play` and with `interactive`.
5. `aria-pressed` on host `◑` and `☝` follows a click, a `view.colored`
   change, and reaches a control added deep inside `controls` after connect.
6. `hidden` on host `colors` and `gestures` inside `controls` follows
   `enable-colors` and `play`.
7. `colored-change` with `preventDefault()` has the same effect from a host
   control as from the default one.
8. `toggleColors()` without `enableColors` and `toggleGestures()` on a board
   that cannot be clicked do nothing; `gestures-change` fires once per change
   and not on connect.
9. A click on a default control of a board nested in host content leaves the
   outer board's viewport alone.
10. The touch rule: whether the browser harness can be switched to
    `pointer: coarse` is measured while the plan is written, and the test
    shape follows the measurement.

## Compatibility

- `apps/lab`: no code change. The lab uses the defaults, so the
  `frame-overlap` invariant (`harness/invariants.ts`) still finds `.chrome`.
- `packages/board-element/demo`: no change.
- Gates: `deno task verify` (the engine's docs and comment guards) and
  `pnpm nx run-many -t verify`.

## Open after this change

- Slot rows on the lab's `/docs` page, with a guard that every slot in the
  template is documented.
