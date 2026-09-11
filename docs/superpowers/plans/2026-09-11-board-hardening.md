# Board Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `<arrowz-board>` survive what the demo sweep threw at it, and
make a plain drag pan on the desktop, with a player switch back to today's
rule.

**Architecture:**
- The gesture rule becomes a mode of the pure `GestureMachine`.
- Validation is a pure `sanitize.ts`, applied only on the way to the layer and
  the viewport.
- The WebGL context is taken on the first connect, and asked back after a
  browser-initiated loss once the board is visible.
- The canvas leaves the layout flow.

The engine is not touched.

**Tech Stack:**
- TypeScript and Lit 3 in `packages/board-element`.
- Vitest 5: a `node` project, and a `chromium` project through Playwright.
- WebGL2.
- The Vite demo.

**Spec:** `docs/superpowers/specs/2026-09-11-board-hardening-design.md`. Read it
before any task. Its §2 "Rulings" are binding.

## Global Constraints

- Everything in the repository is English: code, identifiers, comments, tests,
  docs, and commit messages. Polish appears only in the `pl` dictionary of
  `src/i18n.ts`.
- No `any`, no non-null assertions (`!`).
- Do not touch `packages/engine`. Its `fingerprints.test.ts` must pass
  unchanged.
- Never spread arrays proportional to cells or pieces (`Math.min(...arr)`).
- Commit messages: one plain English sentence describing the behaviour, in the
  style of `git log` on this branch (e.g. "A drag pans, and ..."). No
  attribution lines, no `feat:` prefixes.
- Work on branch `feat/board-hardening`. Never commit to `main`.
- Commands run from `packages/board-element` unless stated:
  - Node tests: `pnpm vitest run --project node <file>`
  - Browser tests: `pnpm vitest run --project chromium <file>`
  - Types: `pnpm run check`
  - Lint and format: `deno lint && deno fmt --check`
  - `pnpm run test` runs both projects. The perf file measures but does not
    gate unless `ARROWZ_MEASURE` is set.
- Every `pointermove` a test or the demo sends while a button is held must
  carry `buttons: 1`. From Task 2 on, a mouse move with no button pressed
  ends the gesture.
- The storage key is exactly `'arrowz-board.gestures'`. Its values are
  exactly `'drag'` and `'click'`.

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `src/sanitize.ts` (new) | drawable values from whatever the host set | 1 |
| `src/sanitize.test.ts` (new) | Node table for §8 of the spec | 1 |
| `src/gestures.ts` | mode, `pressed`, `primary` | 2 |
| `src/gestures.test.ts` | both mode tables, lost release, ghost touch | 2 |
| `src/gl-layer.ts` | lazy acquire, `onForeignLoss`, `disposing` flag | 3 |
| `src/gl-layer.browser.test.ts` | `restore()` after `new GlLayer()`, foreign-loss callback | 3 |
| `src/arrowz-board.ts` | wiring for everything above | 2, 3, 4, 5, 6 |
| `src/i18n.ts`, `src/i18n.test.ts` | new hint and switch labels | 4 |
| `src/arrowz-board.browser.test.ts` | element behaviour | 2, 3, 4, 5, 6 |
| `src/game.browser.test.ts`, `src/perf.browser.test.ts` | click and drag helpers follow the new default | 2, 4 |
| `src/mod.ts` | exports `GestureMode`, `GESTURE_STORAGE_KEY` | 4 |
| `demo/index.html`, `demo/main.ts` | definite height, generate on load, Measure script | 6 |
| `README.md` | controls, sizing, validation | 7 |

Task order is fixed: every task after 1 edits `src/arrowz-board.ts`, so they
run one after another.

---

### Task 1: Drawable values (`sanitize.ts`)

**Files:**
- Create: `packages/board-element/src/sanitize.ts`
- Test: `packages/board-element/src/sanitize.test.ts`

**Interfaces:**
- Consumes: `BoardView`, `DEFAULT_VIEW` from `src/view.ts`.
- Produces (used by Task 5):

  ```ts
  export type IsColor = (css: string) => boolean
  export function drawableView(view: BoardView, isColor: IsColor): BoardView
  export function drawablePad(pad: number, fallback: number): number
  export function drawablePointRadius(radius: number, fallback: number): number
  export function drawableColor(css: string, fallback: string, isColor: IsColor): string
  ```

- [ ] **Step 1: Write the failing test**

Create `src/sanitize.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { drawableColor, drawablePad, drawablePointRadius, drawableView } from './sanitize.ts'
import { DEFAULT_VIEW } from './view.ts'

/** A stand-in for CSS.supports('color', …): hex and one name are colours, nothing else is. */
const isColor = (c: string): boolean => /^#[0-9a-f]{3,8}$/i.test(c) || c === 'red'

describe('drawableView', () => {
  test('a valid view comes back field for field', () => {
    const v = { ...DEFAULT_VIEW, stroke: 0.3, headWidth: 0.8, headHeight: 0.6, top: 5, ink: 'red' }
    expect(drawableView(v, isColor)).toEqual(v)
  })

  test('a number that is not finite becomes the default of its field', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const v = drawableView({ ...DEFAULT_VIEW, stroke: bad, headWidth: bad, headHeight: bad, top: bad }, isColor)
      expect(v.stroke).toBe(DEFAULT_VIEW.stroke)
      expect(v.headWidth).toBe(DEFAULT_VIEW.headWidth)
      expect(v.headHeight).toBe(DEFAULT_VIEW.headHeight)
      expect(v.top).toBe(DEFAULT_VIEW.top)
    }
  })

  test('stroke stays within (0, 1]: wider is one cell, zero or less is the default', () => {
    expect(drawableView({ ...DEFAULT_VIEW, stroke: 5 }, isColor).stroke).toBe(1)
    expect(drawableView({ ...DEFAULT_VIEW, stroke: 1 }, isColor).stroke).toBe(1)
    expect(drawableView({ ...DEFAULT_VIEW, stroke: 0 }, isColor).stroke).toBe(DEFAULT_VIEW.stroke)
    expect(drawableView({ ...DEFAULT_VIEW, stroke: -1 }, isColor).stroke).toBe(DEFAULT_VIEW.stroke)
  })

  test('head sizes below zero become zero, and there is no upper bound', () => {
    const v = drawableView({ ...DEFAULT_VIEW, headWidth: -1, headHeight: -2 }, isColor)
    expect(v.headWidth).toBe(0)
    expect(v.headHeight).toBe(0)
    expect(drawableView({ ...DEFAULT_VIEW, headHeight: 100 }, isColor).headHeight).toBe(100)
  })

  test('top is a whole count, never negative', () => {
    expect(drawableView({ ...DEFAULT_VIEW, top: 1.7 }, isColor).top).toBe(1)
    expect(drawableView({ ...DEFAULT_VIEW, top: -5 }, isColor).top).toBe(0)
    expect(drawableView({ ...DEFAULT_VIEW, top: 1e9 }, isColor).top).toBe(1e9)
  })

  test('a colour the browser would not parse becomes the default of its field', () => {
    const v = drawableView({ ...DEFAULT_VIEW, ink: 'garbage', paper: '', highlight: 'red' }, isColor)
    expect(v.ink).toBe(DEFAULT_VIEW.ink)
    expect(v.paper).toBe(DEFAULT_VIEW.paper)
    expect(v.highlight).toBe('red')
  })

  test('a number passed where a view field wants one, as a string, is not a number', () => {
    // Plain JavaScript hosts can hand the element anything; `view` is typed, but not checked.
    const v = drawableView({ ...DEFAULT_VIEW, stroke: '0.5' as unknown as number }, isColor)
    expect(v.stroke).toBe(DEFAULT_VIEW.stroke)
  })

  test('the booleans pass through untouched', () => {
    const v = drawableView({ ...DEFAULT_VIEW, rounded: false, colored: true, voids: true }, isColor)
    expect([v.rounded, v.colored, v.voids]).toEqual([false, true, true])
  })
})

describe('the attributes', () => {
  test('pad: not finite is the fallback, negative is zero, large stays large', () => {
    expect(drawablePad(NaN, 4)).toBe(4)
    expect(drawablePad(Infinity, 4)).toBe(4)
    expect(drawablePad(-5, 4)).toBe(0)
    expect(drawablePad(2.5, 4)).toBe(2.5)
    expect(drawablePad(1e9, 4)).toBe(1e9)
  })

  test('point radius: not finite is the fallback, otherwise within [0, 0.5]', () => {
    expect(drawablePointRadius(NaN, 0.06)).toBe(0.06)
    expect(drawablePointRadius(-1, 0.06)).toBe(0)
    expect(drawablePointRadius(5, 0.06)).toBe(0.5)
    expect(drawablePointRadius(0.2, 0.06)).toBe(0.2)
  })

  test('point colour: not a colour is the fallback', () => {
    expect(drawableColor('garbage', '#c9c9d6', isColor)).toBe('#c9c9d6')
    expect(drawableColor('#abc', '#c9c9d6', isColor)).toBe('#abc')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --project node src/sanitize.test.ts`
Expected: FAIL, because `./sanitize.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/sanitize.ts`:

```ts
// What the element hands the layer and the viewport, as opposed to what the
// host set. The properties and attributes keep the host's values, exactly as
// `margin` already keeps its own apart from `pad`; only the drawing is
// corrected, so Lit never reflects a corrected value back. The bounds are the
// geometry's, not a UI's: a stroke wider than a cell and a dot wider than half
// a cell overlap their neighbours, and nothing narrower is refused for being
// ugly. Pure and DOM-free: the colour check is passed in, so Node can test it.
import { type BoardView, DEFAULT_VIEW } from './view.ts'

export type IsColor = (css: string) => boolean

/** `value` when it is a finite number, `fallback` otherwise (NaN, ±Infinity, a string). */
function finite(value: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function drawableColor(css: string, fallback: string, isColor: IsColor): string {
  return typeof css === 'string' && isColor(css) ? css : fallback
}

export function drawableView(view: BoardView, isColor: IsColor): BoardView {
  const stroke = finite(view.stroke, DEFAULT_VIEW.stroke)
  return {
    ...view,
    stroke: stroke <= 0 ? DEFAULT_VIEW.stroke : Math.min(stroke, 1),
    headWidth: Math.max(0, finite(view.headWidth, DEFAULT_VIEW.headWidth)),
    headHeight: Math.max(0, finite(view.headHeight, DEFAULT_VIEW.headHeight)),
    top: Math.max(0, Math.floor(finite(view.top, DEFAULT_VIEW.top))),
    ink: drawableColor(view.ink, DEFAULT_VIEW.ink, isColor),
    paper: drawableColor(view.paper, DEFAULT_VIEW.paper, isColor),
    highlight: drawableColor(view.highlight, DEFAULT_VIEW.highlight, isColor),
  }
}

/** The margin asked for, in cells: never negative, and large is allowed (it is drawable). */
export function drawablePad(pad: number, fallback: number): number {
  return Math.max(0, finite(pad, fallback))
}

/** A dot's radius in cells: above half a cell the dots merge into a flood of colour. */
export function drawablePointRadius(radius: number, fallback: number): number {
  return Math.min(Math.max(finite(radius, fallback), 0), 0.5)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run --project node src/sanitize.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Check, lint, and format**

Run: `pnpm run check && deno lint && deno fmt --check`
Expected: no errors. If `deno fmt --check` complains, run `deno fmt src/sanitize.ts src/sanitize.test.ts`
and check again.

- [ ] **Step 6: Commit**

```bash
git add src/sanitize.ts src/sanitize.test.ts
git commit -m "What the element draws is a drawable copy of what the host set"
```

---

### Task 2: The gesture machine gets a mode, and forgets a release it never saw

**Files:**
- Modify: `packages/board-element/src/gestures.ts`
- Modify: `packages/board-element/src/gestures.test.ts`
- Modify: `packages/board-element/src/arrowz-board.ts` (the `sample()` method, and the `gestures` field)
- Modify: `packages/board-element/src/arrowz-board.browser.test.ts` (the `pointer()` helper)
- Modify: `packages/board-element/src/perf.browser.test.ts` (the `pan()` helper)
- Modify: `packages/board-element/demo/main.ts` (the Measure script's `ev` helper)

**Interfaces:**
- Produces (used by Tasks 4 and 5):

  ```ts
  export type GestureMode = 'drag' | 'click'
  export interface PointerSample {
    id: number
    x: number
    y: number
    kind: PointerKind
    modifier: boolean
    t: number
    repeat: boolean
    pressed: boolean
    primary: boolean
  }
  export class GestureMachine {
    constructor(mode?: GestureMode) // defaults to 'drag'
    get mode(): GestureMode
    set mode(m: GestureMode)
    // down/move/up/cancel/panning unchanged in signature
  }
  ```

- The element keeps today's behaviour in this task by constructing
  `new GestureMachine('click')`. Task 4 switches it to the player's mode.

- [ ] **Step 1: Write the failing tests**

In `src/gestures.test.ts`, replace the two helpers at the top with:

```ts
function mouse(x: number, y: number, modifier = false, t = 0, pressed = true): PointerSample {
  return { id: 1, x, y, kind: 'mouse', modifier, t, repeat: false, pressed, primary: true }
}
function touch(id: number, x: number, y: number, t: number, primary = false): PointerSample {
  return { id, x, y, kind: 'touch', modifier: false, t, repeat: false, pressed: true, primary }
}
```

In the existing `describe('mouse', ...)`, change every `new GestureMachine()` to
`new GestureMachine('click')`, and rename the block to
`describe('mouse, click mode (the rule before 2026-09-11)', ...)`. Do the same
for the stand-alone `test('cancel resets everything', ...)` at the bottom. The
touch block keeps `new GestureMachine()`: touch ignores the mode.

Append these blocks at the end of the file:

```ts
describe('mouse, drag mode (the default)', () => {
  test('the default mode is drag', () => {
    expect(new GestureMachine().mode).toBe('drag')
  })

  test('a plain drag pans and its release clicks nothing', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10))
    expect(m.panning).toBe(true)
    expect(m.move(mouse(15, 12))).toEqual({ type: 'pan', dx: 5, dy: 2 })
    expect(m.up(mouse(15, 12))).toEqual({ type: 'none' })
  })

  test('a plain click without movement does nothing at all', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10))
    expect(m.up(mouse(10, 10))).toEqual({ type: 'none' })
  })

  test('a modifier click plays', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10, true))
    expect(m.panning).toBe(false)
    expect(m.up(mouse(11, 10, true))).toEqual({ type: 'click', pressX: 10, pressY: 10, x: 11, y: 10 })
  })

  test('a modifier drag does not pan', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10, true))
    expect(m.move(mouse(60, 60, true))).toEqual({ type: 'none' })
  })

  test('a repeat modifier press yields no click', () => {
    const m = new GestureMachine()
    m.down({ ...mouse(10, 10, true), repeat: true })
    expect(m.up({ ...mouse(10, 10, true), repeat: true })).toEqual({ type: 'none' })
  })

  test('a mode change applies from the next press', () => {
    const m = new GestureMachine('drag')
    m.down(mouse(10, 10))
    m.mode = 'click'
    expect(m.move(mouse(20, 10))).toEqual({ type: 'pan', dx: 10, dy: 0 })
    m.up(mouse(20, 10))
    m.down(mouse(10, 10))
    expect(m.panning).toBe(false)
  })

  test('pen follows the mouse rule', () => {
    const m = new GestureMachine()
    m.down({ ...mouse(10, 10), kind: 'pen' })
    expect(m.panning).toBe(true)
  })
})

describe('a release that never arrived', () => {
  for (const mode of ['drag', 'click'] as const) {
    test(`a move with no button pressed ends the press (${mode} mode)`, () => {
      const m = new GestureMachine(mode)
      const panKey = mode === 'click'
      m.down(mouse(10, 10, panKey))
      expect(m.move(mouse(20, 10, panKey))).toEqual({ type: 'pan', dx: 10, dy: 0 })
      // The pointerup went elsewhere (a context menu, another window).
      expect(m.move(mouse(40, 40, false, 0, false))).toEqual({ type: 'none' })
      expect(m.panning).toBe(false)
      expect(m.move(mouse(60, 60, panKey))).toEqual({ type: 'none' })
      expect(m.up(mouse(60, 60, panKey))).toEqual({ type: 'none' })
    })
  }
})

describe('a touch that never ended', () => {
  test('a primary touch drops the stale one, and the tap clicks', () => {
    const m = new GestureMachine()
    m.down(touch(21, 300, 300, 0, true)) // its pointerup and pointercancel never arrive
    m.down(touch(22, 400, 400, 1000, true)) // the browser says this one is the only touch
    expect(m.up(touch(22, 400, 400, 1050))).toEqual({ type: 'click', pressX: 400, pressY: 400, x: 400, y: 400 })
  })

  test('a second, non-primary finger still starts a pinch', () => {
    const m = new GestureMachine()
    m.down(touch(1, 100, 100, 0, true))
    m.down(touch(2, 200, 100, 0, false))
    expect(m.move(touch(2, 300, 100, 20)).type).toBe('pinch')
  })

  test('touch ignores the mode', () => {
    for (const mode of ['drag', 'click'] as const) {
      const m = new GestureMachine(mode)
      m.down(touch(5, 40, 40, 0, true))
      expect(m.up(touch(5, 40, 40, 100))).toEqual({ type: 'click', pressX: 40, pressY: 40, x: 40, y: 40 })
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project node src/gestures.test.ts`
Expected: FAIL. `pressed` and `primary` are unknown to the type (vitest does not
type-check, so the failures come from behaviour): "the default mode is drag"
fails (`mode` is undefined), "a plain drag pans" fails, and "a move with no
button pressed" fails.

- [ ] **Step 3: Implement the machine changes**

In `src/gestures.ts`:

1. Update the file's header comment. The mouse lines become:

   ```ts
   // - mouse and pen, `drag` mode (the default): a plain drag pans and a plain
   //   click does nothing; a click with the modifier plays;
   // - mouse and pen, `click` mode (the rule before 2026-09-11): a plain click
   //   plays; a drag with the modifier pans;
   // - either mode: the element checks the click lands on the piece it was
   //   pressed on, a repeat press (the browser's own double/triple-click count)
   //   does nothing at all, and a move with no button held ends the press — its
   //   release went somewhere else;
   ```

   Also add a line for touch: "a primary touch going down drops every other
   touch still held, since the browser only marks a touch primary when no
   other is active."
2. Add, after `export type PointerKind`:

   ```ts
   /** Which mouse and pen gesture pans: a plain drag (`drag`) or a drag with the modifier (`click`). */
   export type GestureMode = 'drag' | 'click'
   ```

3. Add two fields to `PointerSample`, after `repeat`:

   ```ts
     /** `buttons & 1` at the time of the sample: whether the primary button (or the pen tip) is down. */
     pressed: boolean
     /** `isPrimary`: for touch, true only when no other touch is active. */
     primary: boolean
   ```

4. In `GestureMachine`, add the mode:

   ```ts
     private currentMode: GestureMode

     constructor(mode: GestureMode = 'drag') {
       this.currentMode = mode
     }

     get mode(): GestureMode {
       return this.currentMode
     }

     /** Applies from the next press: a press already under way keeps the rule it started with. */
     set mode(m: GestureMode) {
       this.currentMode = m
     }
   ```

5. In `down()`, at the very top, before `this.pointers.set(p.id, p)`:

   ```ts
       // The browser marks a touch primary only when no other touch is active,
       // so any touch still held here lost its end somewhere: drop them all.
       if (p.kind === 'touch' && p.primary && this.pointers.size > 0) this.reset()
   ```

   Then replace the pan decision line:

   ```ts
         // A mouse (or pen) pans with the modifier in `click` mode and without it in `drag` mode.
         this.isPanning = p.kind !== 'touch' && p.modifier !== (this.currentMode === 'drag')
   ```

6. In `move()`, right after `if (!this.pointers.has(p.id)) return NONE`:

   ```ts
       // A mouse or pen moving with no button held has already been released,
       // somewhere this element never heard about: the press is over.
       if (p.kind !== 'touch' && !p.pressed) {
         this.reset()
         return NONE
       }
   ```

- [ ] **Step 4: Run the machine tests to verify they pass**

Run: `pnpm vitest run --project node src/gestures.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Wire the two new sample fields in the element, keeping today's mode**

In `src/arrowz-board.ts`:

- Change `private readonly gestures = new GestureMachine()` to:

  ```ts
    // Today's rule until the player's choice is wired in: `click` mode.
    private readonly gestures = new GestureMachine('click')
  ```

- In `sample()`, add to the returned object, after `repeat`:

  ```ts
        pressed: (e.buttons & 1) !== 0,
        primary: e.isPrimary,
  ```

- [ ] **Step 6: Make the synthetic pointers carry a held button**

In `src/arrowz-board.browser.test.ts`, change the `pointer()` helper so a press
and a move hold the primary button and a release does not, unless the caller
says otherwise:

```ts
function pointer(type: string, x: number, y: number, init: Partial<PointerEventInit> = {}): PointerEvent {
  const r = canvasOf(el).getBoundingClientRect()
  return new PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: r.left + x,
    clientY: r.top + y,
    // A real press and drag hold the primary button; the release has let go of it.
    buttons: type === 'pointerup' ? 0 : 1,
    ...init,
  })
}
```

In `src/perf.browser.test.ts`, in `pan()`, add `buttons: 1` to the event
init, next to `ctrlKey: true`.

In `demo/main.ts`, in the Measure handler's `ev` helper, add `buttons: 1`
next to `ctrlKey: true`.

- [ ] **Step 7: Run the element tests to verify nothing regressed**

Run: `pnpm vitest run --project chromium src/arrowz-board.browser.test.ts src/game.browser.test.ts`
Expected: PASS, the same count as before this task.

- [ ] **Step 8: Check, lint, format, and commit**

Run: `pnpm run check && deno lint && deno fmt --check`
Expected: no errors.

```bash
git add src/gestures.ts src/gestures.test.ts src/arrowz-board.ts src/arrowz-board.browser.test.ts src/perf.browser.test.ts demo/main.ts
git commit -m "The gesture machine learns which drag pans, and forgets a press whose release went elsewhere"
```

---

### Task 3: The context is taken on connect, and asked back after the browser takes it

**Files:**
- Modify: `packages/board-element/src/gl-layer.ts` (constructor, `onLost`, `dispose`, a new `onForeignLoss` field, a new `disposing` field)
- Modify: `packages/board-element/src/gl-layer.browser.test.ts` (`beforeEach`, plus one new test)
- Modify: `packages/board-element/src/arrowz-board.ts` (`hasWebgl`, `connectedCallback`, `disconnectedCallback`, the constructor, and two new private methods)
- Modify: `packages/board-element/src/arrowz-board.browser.test.ts` (the `describe('the context a board holds')` block)

**Interfaces:**
- Produces:

  ```ts
  // gl-layer.ts
  class GlLayer {
    /** Called when the browser takes the context away (not when `dispose()` gives it up). */
    onForeignLoss: (() => void) | null
  }
  ```

- `new GlLayer()` no longer holds a context. `restore()` gives it one: for a
  layer that never had one, it acquires synchronously.

- [ ] **Step 1: Write the failing element tests**

In `src/arrowz-board.browser.test.ts`, inside
`describe('the context a board holds', ...)`, append:

```ts
  test('elements created and never connected take no context from a connected board', async () => {
    await mount()
    const canvas = canvasOf(el)
    // Chrome holds about sixteen live contexts; a constructor that took one
    // would have evicted this board's by the sixteenth.
    const orphans: HTMLElement[] = []
    for (let i = 0; i < 20; i++) orphans.push(document.createElement('arrowz-board'))
    await raf()
    await raf()
    expect(isLost(canvas)).toBe(false)
    expect(inked(await painted(el))).toBeGreaterThan(0)
    expect(orphans.length).toBe(20)
  })

  test('a visible board whose context the browser takes gets it back by itself', async () => {
    await mount()
    const canvas = canvasOf(el)
    const lose = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!lose) throw new Error('WEBGL_lose_context is needed for this test')
    // A simulated loss is restored only when someone asks: the browser will
    // not, so a board that recovers here recovered on its own.
    lose.loseContext()
    for (let i = 0; i < 30 && (isLost(canvas) || el.pieceCount === 0); i++) await raf()
    expect(isLost(canvas)).toBe(false)
    expect(inked(await painted(el))).toBeGreaterThan(0)
  })

  test('a board outside the viewport waits to be scrolled to before asking', async () => {
    await mount()
    el.style.position = 'absolute'
    el.style.top = '10000px'
    await raf()
    await raf()
    const canvas = canvasOf(el)
    const lose = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!lose) throw new Error('WEBGL_lose_context is needed for this test')
    lose.loseContext()
    for (let i = 0; i < 10; i++) await raf()
    expect(isLost(canvas)).toBe(true)
    el.style.top = '0px'
    for (let i = 0; i < 30 && isLost(canvas); i++) await raf()
    expect(isLost(canvas)).toBe(false)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project chromium src/arrowz-board.browser.test.ts -t "context"`
Expected: FAIL on all three new tests. The orphans evict the board, and nothing
restores a lost context.

- [ ] **Step 3: Make the layer lazy, and tell a foreign loss from its own**

In `src/gl-layer.ts`:

1. Constructor: remove the `this.acquire()` call, and replace the constructor
   with:

   ```ts
     /**
      * Creates the canvas and nothing else. The context is taken by the first
      * `restore()` — the element calls it on connect — because a context held
      * from construction is held by every element ever created, connected or
      * not, and a page gets about sixteen: the seventeenth `createElement`
      * would evict a board someone is looking at.
      */
     constructor() {
       this.canvas = document.createElement('canvas')
       this.canvas.addEventListener('webglcontextlost', this.onLost)
       this.canvas.addEventListener('webglcontextrestored', this.onRestored)
     }
   ```

2. Add two fields, next to `restoreWanted`:

   ```ts
     /** Set by `dispose()` just before it gives the context up, so `onLost` knows the loss was its own. */
     private disposing = false
     /** Called when the browser takes the context away, not when `dispose()` gives it up. */
     onForeignLoss: (() => void) | null = null
   ```

3. In `onLost`, at the very top (before `e.preventDefault()`):

   ```ts
       const foreign = !this.disposing
       this.disposing = false
   ```

   At the very end of `onLost`, after the `restoreWanted` block:

   ```ts
       // Someone else's loss: whoever owns the layer decides when to ask back.
       if (foreign) this.onForeignLoss?.()
   ```

4. In `dispose()`, replace the last line
   (`if (gl && !gl.isContextLost()) this.loseExt?.loseContext()`) with:

   ```ts
       if (gl && !gl.isContextLost() && this.loseExt) {
         this.disposing = true
         this.loseExt.loseContext()
       }
   ```

5. Update the doc comment of `supported` to say it is also false before the
   first `restore()`.

- [ ] **Step 4: Give every layer in the layer's own tests a context**

In `src/gl-layer.browser.test.ts`, in `beforeEach`, right after
`layer = new GlLayer()`, add:

```ts
  // The constructor takes no context any more; the element asks on connect.
  layer.restore()
```

Append a test at the end of the file:

```ts
test('a loss the browser caused is reported, and one dispose() caused is not', async () => {
  let reported = 0
  layer.onForeignLoss = () => reported++
  const lose = layer.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
  if (!lose) throw new Error('WEBGL_lose_context is needed for this test')
  lose.loseContext()
  await drawn()
  expect(reported).toBe(1)
  layer.restore()
  for (let i = 0; i < 10 && !layer.supported; i++) await frame()
  expect(layer.supported).toBe(true)
  layer.dispose()
  await drawn()
  expect(reported).toBe(1)
})

test('a layer takes no context until it is asked to', () => {
  const idle = new GlLayer()
  expect(idle.supported).toBe(false)
  idle.restore()
  expect(idle.supported).toBe(true)
  idle.dispose()
})
```

- [ ] **Step 5: Run the layer tests**

Run: `pnpm vitest run --project chromium src/gl-layer.browser.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Wire the element**

In `src/arrowz-board.ts`:

1. Replace the `hasWebgl` field and its comment with:

   ```ts
     /**
      * Whether the browser gave the layer a context at all, read once, on the
      * first connect — the layer takes none before (see GlLayer's constructor).
      * `layer.supported` also goes false for as long as a lost context has not
      * been handed back, and that is a failure the layer recovers from by
      * itself: swapping the canvas for the "no WebGL2" message in the middle of
      * it would tell the reader something untrue and take the canvas the
      * pointer listeners are on out of the tree while it happened.
      */
     private hasWebgl = true
     /** Whether `hasWebgl` has been read; see above. */
     private acquired = false
     /** Waits for the board to be visible after the browser took its context; see `watchForRevival`. */
     private revival: IntersectionObserver | null = null
   ```

2. In the constructor, after the listeners, add:

   ```ts
       this.layer.onForeignLoss = () => this.watchForRevival()
   ```

3. In `connectedCallback`, right after `this.layer.restore()`, add:

   ```ts
       if (!this.acquired) {
         this.acquired = true
         this.hasWebgl = this.layer.supported
       }
   ```

   Also update the comment above `this.layer.restore()` to say it is also how
   the very first context is taken.

4. In `disconnectedCallback`, after `this.stopWatchingModifier()`, add
   `this.stopRevival()`.

5. Add, after `disconnectedCallback`:

   ```ts
     /**
      * The browser took the context — another board needed the slot — and will
      * not give it back by itself. The board asks for it once someone can see
      * it: at once if it is on screen, when it is scrolled to otherwise. More
      * than about sixteen boards on screen at once will take each other's
      * contexts in turn; that ceiling is the browser's (spec §5).
      */
     private watchForRevival(): void {
       if (!this.isConnected || this.revival) return
       this.revival = new IntersectionObserver((entries) => {
         if (!entries.some((entry) => entry.isIntersecting)) return
         this.stopRevival()
         this.layer.restore()
       })
       this.revival.observe(this)
     }

     private stopRevival(): void {
       this.revival?.disconnect()
       this.revival = null
     }
   ```

- [ ] **Step 7: Run the element and game tests**

Run: `pnpm vitest run --project chromium src/arrowz-board.browser.test.ts src/game.browser.test.ts`
Expected: PASS, all tests, the three new ones included.

- [ ] **Step 8: Check, lint, format, and commit**

Run: `pnpm run check && deno lint && deno fmt --check`
Expected: no errors.

```bash
git add src/gl-layer.ts src/gl-layer.browser.test.ts src/arrowz-board.ts src/arrowz-board.browser.test.ts
git commit -m "A board takes its context when it is connected, and asks for it back when the browser takes it"
```

---

### Task 4: A plain drag pans, and the player can switch back

**Files:**
- Modify: `packages/board-element/src/i18n.ts`, `packages/board-element/src/i18n.test.ts`
- Modify: `packages/board-element/src/arrowz-board.ts`
- Modify: `packages/board-element/src/mod.ts`
- Modify: `packages/board-element/src/arrowz-board.browser.test.ts`
- Modify: `packages/board-element/src/game.browser.test.ts` (`clickPiece`)
- Modify: `packages/board-element/src/perf.browser.test.ts` (`pan`)
- Modify: `packages/board-element/demo/main.ts` (the Measure handler's `ev`)

**Interfaces:**
- Consumes: `GestureMode` and `GestureMachine.mode` from Task 2.
- Produces:

  ```ts
  // arrowz-board.ts (GESTURE_STORAGE_KEY re-exported from mod.ts next to DEFAULT_PAD)
  export const GESTURE_STORAGE_KEY = 'arrowz-board.gestures'
  // mod.ts: export type { GestureMode } from './gestures.ts'
  class ArrowzBoard {
    /** The rule the mouse and pen follow now: the player's choice on a playable board, `drag` otherwise. */
    get gestureMode(): GestureMode
  }
  // i18n.ts: BoardLabels loses panHintMac/panHintOther and gains:
  //   dragHint, dragPlayHintMac, dragPlayHintOther,
  //   clickHintMac, clickHintOther, gesturesMac, gesturesOther
  ```

- [ ] **Step 1: Write the failing dictionary test**

In `src/i18n.test.ts`, append:

```ts
test('the gesture hints and the switch are labelled in both languages', () => {
  const en = labelsFor('en'), pl = labelsFor('pl')
  expect(en.dragHint).toBe('Drag to pan')
  expect(en.dragPlayHintMac).toBe('Drag to pan · ⌘-click to play')
  expect(en.dragPlayHintOther).toBe('Drag to pan · Ctrl-click to play')
  expect(en.clickHintMac).toBe('Hold ⌘ and drag to pan')
  expect(en.clickHintOther).toBe('Hold Ctrl and drag to pan')
  expect(en.gesturesMac).toBe('Click plays without ⌘')
  expect(en.gesturesOther).toBe('Click plays without Ctrl')
  expect(pl.dragHint).toBe('Przeciągnij, aby przesunąć')
  expect(pl.dragPlayHintMac).toBe('Przeciągnij, aby przesunąć · ⌘ + klik gra')
  expect(pl.dragPlayHintOther).toBe('Przeciągnij, aby przesunąć · Ctrl + klik gra')
  expect(pl.gesturesMac).toBe('Klik gra bez ⌘')
  expect(pl.gesturesOther).toBe('Klik gra bez Ctrl')
})
```

- [ ] **Step 2: Update the dictionary**

In `src/i18n.ts`, replace the two fields `panHintMac` and `panHintOther` in
`BoardLabels` with:

```ts
  /** The hint on a board that only pans: a plain drag. */
  dragHint: string
  /** The hint on a playable board in `drag` mode. */
  dragPlayHintMac: string
  dragPlayHintOther: string
  /** The hint in `click` mode, today's rule: the modifier pans. */
  clickHintMac: string
  clickHintOther: string
  /** The gesture switch: pressed means a plain click plays. */
  gesturesMac: string
  gesturesOther: string
```

Replace the entries in `en`:

```ts
    dragHint: 'Drag to pan',
    dragPlayHintMac: 'Drag to pan · ⌘-click to play',
    dragPlayHintOther: 'Drag to pan · Ctrl-click to play',
    clickHintMac: 'Hold ⌘ and drag to pan',
    clickHintOther: 'Hold Ctrl and drag to pan',
    gesturesMac: 'Click plays without ⌘',
    gesturesOther: 'Click plays without Ctrl',
```

Replace the entries in `pl`:

```ts
    dragHint: 'Przeciągnij, aby przesunąć',
    dragPlayHintMac: 'Przeciągnij, aby przesunąć · ⌘ + klik gra',
    dragPlayHintOther: 'Przeciągnij, aby przesunąć · Ctrl + klik gra',
    clickHintMac: 'Przytrzymaj ⌘ i przeciągnij, aby przesunąć',
    clickHintOther: 'Przytrzymaj Ctrl i przeciągnij, aby przesunąć',
    gesturesMac: 'Klik gra bez ⌘',
    gesturesOther: 'Klik gra bez Ctrl',
```

Run: `pnpm vitest run --project node src/i18n.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing element tests**

In `src/arrowz-board.browser.test.ts`:

- Add `GESTURE_STORAGE_KEY` to the import from `./arrowz-board.ts`.
- In the top-level `beforeEach`, add
  `localStorage.removeItem(GESTURE_STORAGE_KEY)`.
- Add this helper after `pointer()`:

  ```ts
  /** Mounts in the rule before 2026-09-11: a plain click plays, the modifier pans. */
  async function mountClickMode(attrs: Record<string, string> = {}): Promise<ArrowzBoard> {
    localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
    return await mount(attrs)
  }
  ```

Rewrite the existing tests of `describe('clicks', ...)` as follows. Each
change is listed by the test's current name.

- `'a press and release on the same piece emits piece-click when interactive'`:
  send both events with `{ ctrlKey: true }`.
- `'a secondary mouse button is not a press: no piece-click on release'`: add
  `ctrlKey: true` to both inits.
- `'no piece-click without interactive, with the modifier, or when released over another piece'`:
  rename it to
  `'no piece-click without interactive, without the modifier, or when released over another piece'`,
  and replace its body after the `seen` listener with:

  ```ts
    const pa = headPoint(el, a.id), pb = headPoint(el, b.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y, { ctrlKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointerup', pa.x, pa.y, { ctrlKey: true }))
    expect(seen.length).toBe(0)
    el.interactive = true
    await el.updateComplete
    canvasOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y))
    canvasOf(el).dispatchEvent(pointer('pointerup', pa.x, pa.y))
    expect(seen.length).toBe(0)
    canvasOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y, { ctrlKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointerup', pb.x, pb.y, { ctrlKey: true }))
    expect(seen.length).toBe(0)
  ```

- These four switch from `mount(` to `mountClickMode(`, and each name gains the
  suffix `' (click mode)'`:
  - `'a modifier press drops the piece cursor for the grab cursor'`
  - `'holding the modifier shows the grab cursor before any press'`
  - `'the pointer arriving with the modifier already down finds the grab cursor'`
  - `'leaving the board, or the window losing focus, drops the grab cursor'`
- `'a modifier drag pans'`: switch to `mountClickMode()` and rename it to
  `'a modifier drag pans (click mode)'`.
- `'a double click leaves the viewport alone and fires one piece-click'`: add
  `ctrlKey: true` to both inits inside `press`.

Append to `describe('clicks', ...)`:

```ts
  test('a plain drag pans, and a plain click plays nothing', async () => {
    await mount({ play: '' })
    el.zoomBy(3)
    await raf()
    const seen: Event[] = []
    el.addEventListener('piece-click', (e) => seen.push(e))
    const before = el.viewport?.originX ?? 0
    const cellPx = el.viewport?.cellPx ?? 1
    canvasOf(el).dispatchEvent(pointer('pointerdown', 150, 150))
    canvasOf(el).dispatchEvent(pointer('pointermove', 120, 150))
    canvasOf(el).dispatchEvent(pointer('pointerup', 120, 150))
    await raf()
    expect(el.viewport?.originX ?? 0).toBeCloseTo(before + 30 / cellPx, 6)
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y))
    canvasOf(el).dispatchEvent(pointer('pointerup', p.x, p.y))
    expect(seen.length).toBe(0)
  })

  test('in drag mode the board shows grab, and the piece cursor only while the modifier is held', async () => {
    await mount({ play: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerenter', p.x, p.y, { buttons: 0 }))
    canvas.dispatchEvent(pointer('pointermove', p.x, p.y, { buttons: 0 }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
    expect(canvas.classList.contains('over-piece')).toBe(false)
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }))
    expect(canvas.classList.contains('pan-ready')).toBe(false)
    expect(canvas.classList.contains('over-piece')).toBe(true)
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
    expect(canvas.classList.contains('over-piece')).toBe(false)
  })

  test('a Ctrl secondary click keeps its context menu shut only where it plays', async () => {
    await mount({ play: '' })
    const menu = (ctrlKey: boolean) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ctrlKey })
      canvasOf(el).dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(menu(true)).toBe(true)
    expect(menu(false)).toBe(false)
    el.removeAttribute('play')
    await el.updateComplete
    expect(menu(true)).toBe(false)
  })
```

Append a new block:

```ts
describe('the gesture switch', () => {
  const switchOf = (e: ArrowzBoard) => e.shadowRoot?.querySelector<HTMLButtonElement>('button.gestures') ?? null
  const hintOf = (e: ArrowzBoard) => e.shadowRoot?.querySelector('.hint')?.textContent ?? ''
  const mac = /Mac/.test(navigator.platform)

  test('a board that only pans has no switch, is in drag mode, and says so', async () => {
    localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
    await mount()
    expect(switchOf(el)).toBeNull()
    expect(el.gestureMode).toBe('drag')
    expect(hintOf(el)).toBe('Drag to pan')
  })

  test('a playable board starts in drag mode with the switch released', async () => {
    await mount({ play: '' })
    const button = switchOf(el)
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-pressed')).toBe('false')
    expect(button?.getAttribute('title')).toBe(mac ? 'Click plays without ⌘' : 'Click plays without Ctrl')
    expect(el.gestureMode).toBe('drag')
    expect(hintOf(el)).toBe(mac ? 'Drag to pan · ⌘-click to play' : 'Drag to pan · Ctrl-click to play')
  })

  test('pressing it switches to click mode, and a plain click plays again', async () => {
    await mount({ interactive: '' })
    switchOf(el)?.click()
    await el.updateComplete
    expect(el.gestureMode).toBe('click')
    expect(switchOf(el)?.getAttribute('aria-pressed')).toBe('true')
    expect(hintOf(el)).toBe(mac ? 'Hold ⌘ and drag to pan' : 'Hold Ctrl and drag to pan')
    expect(localStorage.getItem(GESTURE_STORAGE_KEY)).toBe('click')
    const seen: Event[] = []
    el.addEventListener('piece-click', (e) => seen.push(e))
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y))
    canvasOf(el).dispatchEvent(pointer('pointerup', p.x, p.y))
    expect(seen.length).toBe(1)
  })

  test('the choice outlives the element', async () => {
    await mount({ play: '' })
    switchOf(el)?.click()
    await el.updateComplete
    el.remove()
    await mount({ play: '' })
    expect(el.gestureMode).toBe('click')
  })

  test('a stored value that is neither mode reads as drag', async () => {
    localStorage.setItem(GESTURE_STORAGE_KEY, 'sideways')
    await mount({ play: '' })
    expect(el.gestureMode).toBe('drag')
  })

  test('lang="pl" labels the switch and the hint in Polish', async () => {
    await mount({ play: '', lang: 'pl' })
    expect(switchOf(el)?.getAttribute('aria-label')).toBe(mac ? 'Klik gra bez ⌘' : 'Klik gra bez Ctrl')
    expect(hintOf(el)).toBe(
      mac ? 'Przeciągnij, aby przesunąć · ⌘ + klik gra' : 'Przeciągnij, aby przesunąć · Ctrl + klik gra',
    )
  })
})
```

Also update `'zoomBy, fit and the buttons move the viewport and emit viewport-change'`.
It counts three buttons on a plain `mount()`, which has no `play`, so the count
stays 3. Leave it as it is, and confirm that it passes.

- [ ] **Step 4: Run the element tests to verify the new ones fail**

Run: `pnpm vitest run --project chromium src/arrowz-board.browser.test.ts`
Expected: FAIL. The new drag-mode and switch tests fail, and `pnpm run check`
reports that `GESTURE_STORAGE_KEY` is not exported.

- [ ] **Step 5: Implement the mode in the element**

In `src/arrowz-board.ts`:

1. Imports: change the gestures import to
   `import { GestureMachine, type GestureMode, type Intent, type PointerSample } from './gestures.ts'`,
   and the i18n import to `import { type BoardLabels, labelsFor } from './i18n.ts'`.

2. After `DEFAULT_POINT_RADIUS`, add:

   ```ts
   /** Where the player's gesture choice is kept, per origin: `'drag'` or `'click'`. */
   export const GESTURE_STORAGE_KEY = 'arrowz-board.gestures'

   /** The stored choice; anything unreadable or unknown is `drag`, the default. */
   function storedMode(): GestureMode {
     try {
       return globalThis.localStorage?.getItem(GESTURE_STORAGE_KEY) === 'click' ? 'click' : 'drag'
     } catch {
       return 'drag' // storage refused (a sandboxed frame): the default
     }
   }

   function storeMode(mode: GestureMode): void {
     try {
       globalThis.localStorage?.setItem(GESTURE_STORAGE_KEY, mode)
     } catch {
       // Private mode or a sandboxed frame: the choice lasts as long as the page.
     }
   }
   ```

3. In `static properties`, add `chosenMode: { state: true },`. Add the
   declaration after `coloredOverride`:

   ```ts
     /** The player's gesture choice, from storage on connect and from the switch after. */
     declare chosenMode: GestureMode
   ```

   In the constructor, set `this.chosenMode = 'drag'`.

4. Change the gestures field back to `private readonly gestures = new GestureMachine()`
   (remove the Task 2 comment), and add
   `private modifierHeld = false` next to `lastPointer`.

5. `connectedCallback`: after `super.connectedCallback()`, add
   `this.chosenMode = storedMode()`.

6. Add to the constructor's listeners:
   `canvas.addEventListener('contextmenu', this.onContextMenu)`.

7. Public API, after `get pieceCount()`:

   ```ts
     /** The rule the mouse and pen follow now: the player's choice on a playable board, `drag` otherwise. */
     get gestureMode(): GestureMode {
       return this.playable ? this.chosenMode : 'drag'
     }

     /** Whether a click can do anything: a board that only pans has only panning to choose. */
     private get playable(): boolean {
       return this.play || this.interactive
     }
   ```

8. `render()`: replace the hint span with
   `<span class="hint">${this.hint(l)}</span>`. After the colours button
   block, add:

   ```ts
         ${this.playable
           ? html`
             <button
               type="button"
               class="gestures"
               title=${isMac ? l.gesturesMac : l.gesturesOther}
               aria-label=${isMac ? l.gesturesMac : l.gesturesOther}
               aria-pressed=${this.chosenMode === 'click' ? 'true' : 'false'}
               @click=${this.toggleGestures}
             >☝</button>
           `
           : ''}
   ```

   Add these methods near `render()`:

   ```ts
     private hint(l: BoardLabels): string {
       if (this.gestureMode === 'click') return isMac ? l.clickHintMac : l.clickHintOther
       if (!this.playable) return l.dragHint
       return isMac ? l.dragPlayHintMac : l.dragPlayHintOther
     }

     private readonly toggleGestures = (): void => {
       this.chosenMode = this.chosenMode === 'click' ? 'drag' : 'click'
       storeMode(this.chosenMode)
     }
   ```

9. `static styles`: after `button:hover`, add

   ```css
       button[aria-pressed='true'] {
         background: #dde;
       }
   ```

   and inside `@media (pointer: coarse)`, make the rule
   `.hint, .gestures { display: none; }`.

10. `updated()`: add as its first line:

    ```ts
        // Applies from the next press (see GestureMachine.mode), so a change mid-drag is safe.
        this.gestures.mode = this.gestureMode
        if (changed.has('chosenMode') || changed.has('play') || changed.has('interactive')) this.refreshCursor()
    ```

11. Replace the whole cursor block. That is the doc comment of `setPanReady`,
    `setPanReady`, `onModifierKey`, `onWindowBlur`, `onPointerEnter`,
    `onPointerLeave`, `stopWatchingModifier`, and the cursor lines inside
    `onPointerMove`. The new block:

    ```ts
      /**
       * The cursor answers before the click, because the modifier decides what
       * the next click does. In `drag` mode the board is `grab` everywhere and
       * a piece shows `pointer` only while the modifier is held — only then
       * does a click play. In `click` mode it is the other way round: the
       * modifier turns the board to `grab` and takes the piece cursor away,
       * which would otherwise promise a move the click will not make. The key
       * events are taken from the window, because the board is not
       * necessarily focused when someone puts their hand on ⌘, and only while
       * the pointer is over it, so a board nobody is pointing at listens to
       * nothing.
       */
      private refreshCursor(): void {
        if (this.gestures.panning) return
        const canvas = this.layer.canvas
        const p = this.lastPointer
        if (!p) {
          canvas.classList.remove('pan-ready', 'over-piece')
          return
        }
        const panReady = this.modifierHeld !== (this.gestureMode === 'drag')
        canvas.classList.toggle('pan-ready', panReady)
        canvas.classList.toggle('over-piece', !panReady && this.pieceAt(p.x, p.y) !== null)
      }

      private setModifier(held: boolean): void {
        this.modifierHeld = held
        this.refreshCursor()
      }

      private readonly onModifierKey = (e: KeyboardEvent): void => {
        this.setModifier(e.metaKey || e.ctrlKey)
      }

      // ⌘-Tab hands the keyup to another window, so the modifier would stay "held".
      private readonly onWindowBlur = (): void => {
        this.setModifier(false)
      }

      private readonly onPointerEnter = (e: PointerEvent): void => {
        globalThis.addEventListener('keydown', this.onModifierKey)
        globalThis.addEventListener('keyup', this.onModifierKey)
        globalThis.addEventListener('blur', this.onWindowBlur)
        const s = this.sample(e)
        this.lastPointer = { x: s.x, y: s.y }
        this.setModifier(e.metaKey || e.ctrlKey)
      }

      private readonly onPointerLeave = (): void => {
        this.stopWatchingModifier()
      }

      private stopWatchingModifier(): void {
        globalThis.removeEventListener('keydown', this.onModifierKey)
        globalThis.removeEventListener('keyup', this.onModifierKey)
        globalThis.removeEventListener('blur', this.onWindowBlur)
        this.lastPointer = null
        this.modifierHeld = false
        this.refreshCursor()
      }

      /**
       * On macOS a Ctrl click is a secondary click: the press arrives as a
       * primary one with `ctrlKey`, then a context menu. Where that press plays,
       * the menu stays shut; everywhere else it is the page's.
       */
      private readonly onContextMenu = (e: MouseEvent): void => {
        if (e.ctrlKey && this.playable && this.gestureMode === 'drag') e.preventDefault()
      }
    ```

    `onPointerMove` becomes:

    ```ts
      private readonly onPointerMove = (e: PointerEvent): void => {
        const s = this.sample(e)
        this.lastPointer = { x: s.x, y: s.y }
        this.apply(this.gestures.move(s))
        if (this.gestures.panning) return
        this.setModifier(e.metaKey || e.ctrlKey)
      }
    ```

    `onPointerUp` and `onPointerCancel` each gain a last line:
    `this.refreshCursor()`.

12. `src/mod.ts`: add `GESTURE_STORAGE_KEY` to the value `export { … } from './arrowz-board.ts'`
    list (keep it alphabetical: after `DEFAULT_SHOW_POINTS`), and add a line
    `export type { GestureMode } from './gestures.ts'` after the
    `./arrowz-board.ts` type exports.

- [ ] **Step 6: Follow the new default in the game and perf helpers, and in the demo**

- `src/game.browser.test.ts`, `clickPiece`: add `ctrlKey: true` and
  `buttons: 1` to `init`. Also update the doc comment: "the way a mouse would
  in drag mode, the default: with the modifier".
- `src/perf.browser.test.ts`, `pan()`: remove `ctrlKey: true`, since a plain
  drag pans by default. Keep `buttons: 1`, and change its doc comment to "A
  plain drag over the canvas". Put
  `localStorage.removeItem('arrowz-board.gestures')` in that file's setup, so
  a stored choice cannot leak in. If the file has a `beforeEach`, add it there;
  if it has none, put it at the top of `mount()`.
- `demo/main.ts`, the Measure handler's `ev`: replace `ctrlKey: true` with
  `ctrlKey: board.gestureMode === 'click'`.

- [ ] **Step 7: Run all tests**

Run: `pnpm run test`
Expected: PASS, both projects.

- [ ] **Step 8: Check, lint, format, and commit**

Run: `pnpm run check && deno lint && deno fmt --check`
Expected: no errors.

```bash
git add src/i18n.ts src/i18n.test.ts src/arrowz-board.ts src/mod.ts src/arrowz-board.browser.test.ts src/game.browser.test.ts src/perf.browser.test.ts demo/main.ts
git commit -m "A plain drag pans and a modifier click plays, and the player can switch back"
```

---

### Task 5: Lost captures, taken shortcuts, and nonsense numbers

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts`
- Modify: `packages/board-element/src/arrowz-board.browser.test.ts`

**Interfaces:**
- Consumes: `drawableView`, `drawablePad`, `drawablePointRadius`,
  `drawableColor` from Task 1. `pressed` on `PointerSample` (Task 2) is
  already wired.

- [ ] **Step 1: Write the failing tests**

In `src/arrowz-board.browser.test.ts`, append to `describe('clicks', ...)`:

```ts
  test('a capture lost mid-drag ends the pan, and a later move does not pan', async () => {
    await mount()
    el.zoomBy(3)
    await raf()
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerdown', 150, 150))
    canvas.dispatchEvent(pointer('pointermove', 140, 150))
    expect(canvas.classList.contains('panning')).toBe(true)
    canvas.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }))
    expect(canvas.classList.contains('panning')).toBe(false)
    await raf()
    const before = el.viewport?.originX
    canvas.dispatchEvent(pointer('pointermove', 100, 150))
    await raf()
    expect(el.viewport?.originX).toBe(before)
  })

  test('a move with no button held after a lost release does not pan', async () => {
    await mount()
    el.zoomBy(3)
    await raf()
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerdown', 150, 150))
    canvas.dispatchEvent(pointer('pointermove', 140, 150))
    await raf()
    const before = el.viewport?.originX
    canvas.dispatchEvent(pointer('pointermove', 100, 150, { buttons: 0 }))
    canvas.dispatchEvent(pointer('pointermove', 60, 150, { buttons: 0 }))
    await raf()
    expect(el.viewport?.originX).toBe(before)
  })
```

Append to `describe('mount and viewport', ...)`:

```ts
  test('keys with ⌘, Ctrl or Alt are left to the browser', async () => {
    await mount()
    el.focus()
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      for (const key of ['+', '=', '-', '0']) {
        const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mod })
        el.dispatchEvent(e)
        expect(e.defaultPrevented, `${JSON.stringify(mod)} ${key}`).toBe(false)
      }
    }
    await raf()
    expect(el.viewport?.fitted).toBe(true)
  })

  test('without a board no key is taken', async () => {
    el = document.createElement('arrowz-board')
    el.style.width = '300px'
    el.style.height = '300px'
    document.body.append(el)
    await el.updateComplete
    el.focus()
    const e = new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })
    el.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
```

Append a new block:

```ts
describe('nonsense in, a drawable board out', () => {
  const allFinite = (v: BoardViewport | null | undefined): boolean =>
    v !== null && v !== undefined && [v.cellPx, v.originX, v.originY, v.hostWidth, v.hostHeight].every(Number.isFinite)

  test('a pad that is not a number fits as the default pad, and the attribute keeps what was set', async () => {
    const details: BoardViewport[] = []
    document.addEventListener('viewport-change', (e) => details.push((e as ViewportChangeEvent).detail))
    await mount({ pad: 'abc' })
    expect(el.getAttribute('pad')).toBe('abc')
    expect(allFinite(el.viewport)).toBe(true)
    expect(el.viewport?.originX).toBeCloseTo(-DEFAULT_PAD, 6)
    expect(details.every(allFinite)).toBe(true)
  })

  test('a stroke or head height that is not a number still draws the pieces', async () => {
    await mount()
    el.view = { ...el.view, stroke: NaN, headHeight: NaN }
    await el.updateComplete
    expect(inked(await painted(el))).toBeGreaterThan(0)
    expect(Number.isNaN(el.view.stroke)).toBe(true) // the property keeps what the host set
  })

  test('a point radius past half a cell does not flood the paper', async () => {
    await mount({ 'show-points': '', 'point-color': '#ff00ff', 'point-radius': '5' })
    el.zoomBy(3)
    await raf()
    const buf = await painted(el)
    const canvas = canvasOf(el)
    const vp = el.viewport
    if (!vp) throw new Error('need a viewport')
    const dpr = devicePixelRatio
    // A cell corner is 0.707 cells from the dot at the cell's centre and a
    // quarter cell clear of any stroke: a dot of radius ≤ 0.5 never reaches
    // it, and an unclamped radius of 5 paints every one of them.
    let corners = 0, magenta = 0
    for (let y = 1; y < 30; y++) {
      for (let x = 1; x < 30; x++) {
        const px = Math.round((x - vp.originX) * vp.cellPx * dpr)
        const py = Math.round((y - vp.originY) * vp.cellPx * dpr)
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue
        const i = ((canvas.height - 1 - py) * canvas.width + px) * 4 // readPixels rows run bottom-up
        corners++
        if (buf[i] === 255 && buf[i + 1] === 0 && buf[i + 2] === 255) magenta++
      }
    }
    expect(el.pointRadius).toBe(5) // the attribute keeps what the host set
    expect(corners).toBeGreaterThan(20)
    expect(magenta).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project chromium src/arrowz-board.browser.test.ts`
Expected: FAIL on the lost-capture test, the modifier-keys test, the no-board
key test, and all three "nonsense" tests. The "move with no button held" test
already passes, because Task 2 did that work; keep it as a guard.

- [ ] **Step 3: Implement**

In `src/arrowz-board.ts`:

1. Add the import:
   `import { drawableColor, drawablePad, drawablePointRadius, drawableView } from './sanitize.ts'`.
2. Next to `isMac`, add:

   ```ts
   /** The browser's own colour parser, so anything `view.ink` may say is judged the way it will be drawn. */
   const isCssColor = (c: string): boolean => typeof CSS !== 'undefined' && CSS.supports('color', c)
   ```

3. `redraw()`: pass
   `drawableView({ ...DEFAULT_VIEW, ...this.view, colored: this.colored }, isCssColor)`
   as the view.
4. `updatePoints()`:

   ```ts
       this.layer.setPoints(
         visible,
         drawableColor(this.pointColor, DEFAULT_POINT_COLOR, isCssColor),
         drawablePointRadius(this.pointRadius, DEFAULT_POINT_RADIUS),
       )
   ```

5. `syncViewport()`: at its top, add
   `const pad = drawablePad(this.pad, DEFAULT_PAD)`. Use `pad` in both places
   where `this.pad` appears in that method: `this.layer.pad = pad` and
   `pad` in `input`.
6. Constructor: add
   `canvas.addEventListener('lostpointercapture', this.onPointerCancel)`.
   `onPointerCancel` takes a `PointerEvent`, and a `lostpointercapture` is
   one. Add this comment above the line: "A capture taken away (a context
   menu, the element leaving the tree) is a gesture that will get no release.
   The browser also sends one after every ordinary release, and cancelling a
   gesture that already ended is a no-op in the machine."
7. `onKeyDown`: add as its first line:

   ```ts
       // ⌘/Ctrl + -, + and 0 are the browser's page zoom, and Alt belongs to
       // the platform; without a viewport there is nothing to zoom, and the
       // wheel does not swallow its event there either.
       if (e.metaKey || e.ctrlKey || e.altKey || !this.vp) return
   ```

- [ ] **Step 4: Run all tests**

Run: `pnpm run test`
Expected: PASS.

- [ ] **Step 5: Check, lint, format, and commit**

Run: `pnpm run check && deno lint && deno fmt --check`
Expected: no errors.

```bash
git add src/arrowz-board.ts src/arrowz-board.browser.test.ts
git commit -m "A lost capture ends the drag, the browser keeps its zoom keys, and nonsense numbers draw the default"
```

---

### Task 6: The canvas leaves the layout, and the demo opens on a board

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (`static styles`, the `canvas` rule)
- Modify: `packages/board-element/src/arrowz-board.browser.test.ts`
- Modify: `packages/board-element/demo/index.html` (the `body` rule)
- Modify: `packages/board-element/demo/main.ts` (the end of the Generation section)

- [ ] **Step 1: Write the failing test**

Append to `describe('mount and viewport', ...)`:

```ts
  test('the host takes its parent height back after an odd size, whatever the canvas was', async () => {
    const box = document.createElement('div')
    box.style.width = '300px'
    box.style.height = '240px'
    document.body.append(box)
    el = document.createElement('arrowz-board')
    el.style.width = '100%'
    el.style.height = '100%'
    box.append(el)
    el.board = makeBoard()
    await el.updateComplete
    await raf()
    await raf()
    expect(el.getBoundingClientRect().height).toBeCloseTo(240, 0)
    el.style.width = '20px'
    el.style.height = '3000px'
    await raf()
    await raf()
    el.style.width = '100%'
    el.style.height = '100%'
    await raf()
    await raf()
    expect(el.getBoundingClientRect().height).toBeCloseTo(240, 0)
    expect(el.viewport?.hostHeight).toBeCloseTo(240, 0)
    box.remove()
  })

  test('a host nobody sized has no height of its own', async () => {
    el = document.createElement('arrowz-board')
    document.body.append(el)
    el.board = makeBoard()
    await el.updateComplete
    await raf()
    await raf()
    expect(el.getBoundingClientRect().height).toBe(0)
    expect(el.viewport).toBeNull()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project chromium src/arrowz-board.browser.test.ts -t "height"`
Expected: FAIL. After the odd size the host is not 240 px tall, and the
unsized host is not 0 tall, because the canvas gives it an intrinsic size.

Note: the first test's parent has a definite height, so it may pass already.
The second test must fail. If both pass before the change, stop and report:
the premise of spec §9 would be wrong.

- [ ] **Step 3: Implement**

In `static styles` of `src/arrowz-board.ts`, replace the `canvas` rule's
`display: block; width: 100%; height: 100%;` with:

```css
      /* Out of the flow: a canvas in it lends the host its intrinsic size, and
        since the canvas is sized to the host, the host's height would depend
        on whatever size it had before (spec §9). The host is sized by its
        consumer, like any <div>. */
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
```

Keep `touch-action`, `user-select`, `-webkit-user-select` and the comment that
explains them.

- [ ] **Step 4: Run the element tests**

Run: `pnpm vitest run --project chromium src/arrowz-board.browser.test.ts`
Expected: PASS.

- [ ] **Step 5: Give the demo a definite height and a board on load**

In `demo/index.html`, change the body rule to:

```css
    body { display: grid; grid-template-columns: minmax(0, 1fr) 380px; grid-template-rows: 100%; }
```

In `demo/main.ts`, after the `worker.onmessageerror` line, add:

```ts
// The demo opens on a board rather than on an empty host that waits for a click.
generateButton.click()
```

- [ ] **Step 6: Run all tests, then check, lint, format, and commit**

Run: `pnpm run test && pnpm run check && deno lint && deno fmt --check`
Expected: PASS and no errors.

```bash
git add src/arrowz-board.ts src/arrowz-board.browser.test.ts demo/index.html demo/main.ts
git commit -m "The canvas no longer lends the host a height, and the demo opens on a board"
```

---

### Task 7: The README says what the board does now

**Files:**
- Modify: `packages/board-element/README.md`

- [ ] **Step 1: Rewrite the controls paragraph**

Replace the paragraph starting "Controls: click without a modifier plays; …"
(lines 61–65) with:

```markdown
Controls, mouse and pen: a plain drag pans, and a click with ⌘ (Ctrl elsewhere)
plays. A plain click does nothing, so a hand that twitches while panning never
costs a life. A playable board (`play` or `interactive`) shows a ☝ switch in the
corner. Pressed, it restores the rule from before: a plain click plays and a
drag with ⌘ or Ctrl pans. The choice belongs to the player: it is kept in
`localStorage` under `arrowz-board.gestures`, read by each board when it
connects, and readable as the `gestureMode` property. There is no attribute for
it. A board that only pans has no switch and always pans with a plain drag.
Touch is the same in both modes: one finger pans, two pinch, a tap plays. The
wheel zooms towards the cursor; `+`, `−`, `0` and the corner buttons zoom and
fit, and with ⌘, Ctrl or Alt held those keys are left to the browser's own page
zoom. A repeated press — a double click, a double tap — does nothing at all:
the second one is read as a slipped finger, not as an instruction.
```

- [ ] **Step 2: Rewrite the cursor paragraph**

Replace the paragraph starting "Holding ⌘ or Ctrl shows the grab cursor …"
with:

```markdown
The cursor tells what the next click will do before it is made. In the default
mode the board shows the grab cursor, and a piece shows the pointer cursor only
while ⌘ or Ctrl is held, since only then does a click play. In the switched
mode it is the other way round: the modifier turns the board to grab and takes
the piece cursor away. On macOS a Ctrl click is a secondary click. Where it
plays, the board keeps the context menu shut.
```

- [ ] **Step 3: Add a sizing and validation section**

Right before `### The margin`, add:

```markdown
### Size, and values the board cannot draw

The host has no size of its own, like a `<div>`: give it a width and a height,
or put it in a parent that has them. The canvas fills the host and takes no part
in its layout.

Numbers and colours the board cannot draw are replaced, silently and only in
the drawing; the properties and attributes keep what was set.

- A value that is not a finite number becomes its default.
- `stroke` is at most one cell.
- Head sizes and `pad` are never negative.
- `top` is a whole count.
- `point-radius` stays within [0, 0.5].
- A colour the browser cannot parse becomes the default of its field.
```

- [ ] **Step 4: Add the context note**

In the README, find the paragraph about the WebGL context. Search for
"context"; if there is no such paragraph, add one at the end of the section
that describes the element's behaviour:

```markdown
A board takes its WebGL context when it is connected, not when it is created,
and gives it up when it is removed. If the browser takes it away — a page gets
about sixteen — the board asks for it back as soon as it is on screen. More
than about sixteen boards on screen at once will take each other's contexts in
turn.
```

- [ ] **Step 5: Format and commit**

Run: `deno fmt --check README.md`. If it reports anything, run
`deno fmt README.md`. If the README is excluded, nothing is reported, which
is fine.

```bash
git add README.md
git commit -m "The README tells how the board is driven, sized and kept alive now"
```

---

### Task 8: Whole-branch verification

- [ ] **Step 1:** From the repository root, run `pnpm nx run-many -t verify`.
  Expected: PASS for every project.
- [ ] **Step 2:** In `packages/engine`, run `deno task verify`.
  Expected: PASS, and `fingerprints.test.ts` unchanged.
- [ ] **Step 3:** Check the demo by hand (`pnpm nx serve board-element`, then
  `http://localhost:8778/`). The controller does this in Chrome, not a subagent:
  - The demo opens on a board.
  - A plain drag pans, and a plain click does nothing.
  - ⌘-click plays; on a Mac, Ctrl-click plays without a context menu.
  - The ☝ switch restores today's rule and survives a reload.
  - After `for (let i = 0; i < 20; i++) document.createElement('arrowz-board')`
    in the console, the board is still drawn.
  - `pad="abc"` in the inspector keeps the board visible.
  - Measure on Insane reports about 34 ms for pan and for zoom.

  Record the figures in the PR description.
