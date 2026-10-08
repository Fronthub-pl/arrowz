# The board's own bar keeps clear of the fitted board — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `fit()` of `<arrowz-board>` widens the margin when, and only when, the element's default control bar would lie over the fitted board, so no drawn cell is under the bar at fit.

**Architecture:** The math lives in `viewport.ts` (pure, tested in Node): an optional `bar` box on the viewport input and a fourth margin candidate, `byBar`, used only on a collision. The element measures its default bar (`.chrome`) with the `ResizeObserver` it already has and feeds the box into the viewport; a fitted board refits on a bar change, a zoomed one only clamps. The lab's `board-cover` invariant learns the element's bar, which turns 45 cases of its layout matrix red without the fix and green with it.

**Tech Stack:** TypeScript, Lit (`packages/board-element`), Vitest (Node and Chromium browser projects), React lab (`apps/lab`), Nx, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-08-board-bar-clear-fit-design.md`

Work in the worktree `/Users/tomek/dev/arrowz-bar-fit` on the branch `board-element/bar-clear-fit` (bead `arrowz-6ce`, already claimed). Every command below runs from that worktree unless it says otherwise. The code in this plan was run once as a throwaway sketch (`/tmp/arrowz-6ce-spike.diff`); the test numbers below come from that run.

## Global Constraints

- Everything in the repository is English; the Polish text goes only into `apps/lab/docs-content/pl/element.md`.
- No `any`, no non-null assertions (`!`).
- Comments say why, once: non-header blocks ≤ 6 lines, no history ("used to", PR or task numbers), symbols not `file.ts:NN` (`packages/engine/comments.test.ts` guards it).
- `pad = 0` stays edge to edge: "asking for no margin is not asking for one sized to the bar".
- A host that fills its own `controls` slot gets no reservation.
- No new attribute, property or event on the element.
- Never edit `packages/cli/boards/`; never stop servers on ports 8777/8779.
- No attribution lines in commit messages or the PR body. The PR body carries `Bead: arrowz-6ce`.
- The lab consumes `@arrowz/board-element` from its `dist/`: run `pnpm nx build board-element` before any lab test that should see an element change.

## Review Focus

1. A host narrow enough that the default bar wraps to two rows: the reservation must use the wrapped height, and the board must still be clear (test in Task 2).
2. A bar that changes size on a zoomed board (play switched off, language changed): the scale must not move (test in Task 2).
3. A host shorter than two bars (70 px): no reservation, no negative or infinite margin, the board still draws (tests in Task 1 and Task 2).
4. An element moved to another parent (disconnect and connect in one task): it must keep following its bar (test in Task 2).
5. `pad = 0` with a colliding bar: margin stays 0 (test in Task 1).

---

### Task 1: The bar in the viewport math

**Files:**
- Modify: `packages/board-element/src/viewport.ts` (`ViewportInput`, `Viewport.margin` doc, `marginOf`, new `byBar`, `clamp`, new `withBar`)
- Test: `packages/board-element/src/viewport.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `ViewportInput.bar?: { width: number; height: number } | undefined`, the default bar's box measured from the host's bottom-right corner in CSS px, its offset included;
  - `export function withBar(v: Viewport, bar: ViewportInput['bar']): Viewport`.

- [ ] **Step 1: Write the failing tests**

Change the import line at the top of `viewport.test.ts` to:

```ts
import { fit, MAX_CELL_PX, MIN_PAD_PX, panBy, resize, screenToCell, withBar, zoomAt, zoomBy } from './viewport.ts'
```

Append at the end of the file:

```ts
// The lab's host at 375×812 and 1024×768 with its default 25×50 board, and the
// default bar under a finger: four 32 px buttons, gaps, and the 8 px offset.
describe('the default bar', () => {
  const tall = { W: 25, H: 50, hostWidth: 375, hostHeight: 441, pad: 4 }
  const bar = { width: 148, height: 40 }

  /** The fitted board's right and bottom edges, in px from the host's top-left. */
  const edges = (v: ReturnType<typeof fit>) => ({
    right: (v.W - v.originX) * v.cellPx,
    bottom: (v.H - v.originY) * v.cellPx,
  })

  test('a board the bar would cover gets a margin that keeps it above the bar', () => {
    const v = fit({ ...tall, bar })
    expect(edges(v).bottom).toBeLessThanOrEqual(tall.hostHeight - bar.height + 1e-9)
    expect(v.margin).toBeCloseTo((bar.height * tall.H) / (tall.hostHeight - 2 * bar.height), 9)
    expect(v.cellPx).toBeLessThan(fit(tall).cellPx)
  })

  test('the board stays centred: the margin is the same on every side', () => {
    const v = fit({ ...tall, bar })
    expect(v.originY).toBeCloseTo((tall.H - tall.hostHeight / v.cellPx) / 2, 9)
    expect(v.originX).toBeCloseTo((tall.W - tall.hostWidth / v.cellPx) / 2, 9)
  })

  test('a board with room under it fits exactly as without a bar', () => {
    const roomy = { ...tall, hostWidth: 832, hostHeight: 282 }
    expect(fit({ ...roomy, bar })).toEqual({ ...fit(roomy), bar })
  })

  test('a wide board whose bottom lies above the bar fits exactly as without one', () => {
    const wide = { ...tall, W: 50, H: 10 }
    expect(fit({ ...wide, bar })).toEqual({ ...fit(wide), bar })
  })

  test('no bar fits as before', () => {
    expect(fit({ ...tall, bar: undefined }).cellPx).toBe(fit(tall).cellPx)
  })

  test('a pad of zero stays zero under a bar', () => {
    const v = fit({ ...tall, pad: 0, bar })
    expect(v.margin).toBe(0)
    expect(v.cellPx).toBe(fit({ ...tall, pad: 0 }).cellPx)
  })

  test('a host shorter than two bars reserves nothing', () => {
    const short = { ...tall, hostHeight: 70 }
    const v = fit({ ...short, bar })
    expect(v.margin).toBe(fit(short).margin)
    expect(Number.isFinite(v.cellPx) && v.cellPx > 0).toBe(true)
  })

  test('withBar refits a fitted view', () => {
    expect(withBar(fit(tall), bar)).toEqual(fit({ ...tall, bar }))
  })

  test('withBar keeps the scale of a zoomed view', () => {
    const zoomed = zoomBy(fit(tall), 2)
    const v = withBar(zoomed, bar)
    expect(v.cellPx).toBe(zoomed.cellPx)
    expect(v.fitted).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd packages/board-element && pnpm exec vitest run src/viewport.test.ts`
Expected: FAIL. `withBar` is not exported, and the type check rejects `bar` on the input.

- [ ] **Step 3: Implement**

In `viewport.ts`, extend `ViewportInput`:

```ts
export interface ViewportInput {
  W: number
  H: number
  hostWidth: number
  hostHeight: number
  /** Margin asked for around the board, in cells; 0 for none. */
  pad: number
  /**
   * The element's default bar, as a box from the host's bottom-right corner in
   * CSS px with its offset; absent when there is none to keep clear of.
   */
  bar?: { width: number; height: number } | undefined
}
```

Change the doc of `Viewport.margin` to:

```ts
  /** The margin actually kept, in cells: `pad`, or wider when it would go under MIN_PAD_PX or leave the board under the bar. */
  margin: number
```

Replace the last line of `marginOf` (`return Math.max(v.pad, byWidth, byHeight)`) with:

```ts
  const m = Math.max(v.pad, byWidth, byHeight)
  return Math.max(m, byBar(v, m))
}

/**
 * The margin that keeps the default bar off the board fitted at margin `m`,
 * or 0 when the bar already lies clear of it: the closed form above with the
 * bar's height for the floor. The collision is read at `m`; a wider margin
 * only shrinks the board towards the centre, so it cannot cause one.
 */
function byBar(v: ViewportInput, m: number): number {
  const bar = v.bar
  if (bar === undefined || v.hostHeight <= 2 * bar.height) return 0
  const s = Math.min(v.hostWidth / (v.W + 2 * m), v.hostHeight / (v.H + 2 * m))
  // Half a pixel or less is rounding, not a covered cell.
  const across = (v.hostWidth + v.W * s) / 2 - (v.hostWidth - bar.width) > 0.5
  const down = (v.hostHeight + v.H * s) / 2 - (v.hostHeight - bar.height) > 0.5
  return across && down ? (bar.height * v.H) / (v.hostHeight - 2 * bar.height) : 0
}
```

(The closing brace of `marginOf` moves up with the replaced line, so make sure that `marginOf` ends after `return Math.max(m, byBar(v, m))`.)

In `clamp`, add `bar: v.bar,` to the returned object right after `pad: v.pad,`.

After `resize`, add:

```ts
/** The same view with another bar: refitted when it was fitted, bounded otherwise, like `resize`. */
export function withBar(v: Viewport, bar: ViewportInput['bar']): Viewport {
  const next = { ...v, bar }
  return v.fitted ? fit(next) : clamp(next)
}
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/board-element && pnpm exec vitest run src/viewport.test.ts`
Expected: PASS, all of `viewport.test.ts`, including the existing `margin` and `resize` blocks.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/viewport.ts packages/board-element/src/viewport.test.ts
git commit -m "Viewport: keep the board clear of the default bar at fit

An optional bar box on the input adds a fourth margin candidate, byBar, used
only when the bar would lie over the board fitted at the usual margin. The
same closed form as MIN_PAD_PX, so nothing is searched. withBar refits a
fitted view and only clamps a zoomed one."
```

---

### Task 2: The element measures its bar

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (import from `./viewport.ts`; field `bar`; `connectedCallback`; `render`'s `controls` slot; new `firstUpdated`; `onResize`; new `observeBar`, `readBar`, `syncBar`, `onControlsChange`; `syncViewport`)
- Modify: `packages/board-element/src/arrowz-board.browser.test.ts` (constants, `mount`, 11 existing tests, a new `describe`)
- Modify: `packages/board-element/src/controls.browser.test.ts` (constants, one assertion)

**Interfaces:**
- Consumes: `ViewportInput['bar']`, `withBar` (Task 1).
- Produces: no public API. Internally `private bar: ViewportInput['bar']`.

- [ ] **Step 1: Write the failing tests**

In `arrowz-board.browser.test.ts` append, after the last `describe`:

```ts
describe('the default bar and the fit', () => {
  /** A board in a host of the given size; `children` is light DOM parsed before connecting. */
  async function sized(
    width: number,
    height: number,
    W: number,
    H: number,
    { children = '', attrs = {} }: { children?: string; attrs?: Record<string, string> } = {},
  ): Promise<ArrowzBoard> {
    el = document.createElement('arrowz-board')
    el.style.width = `${width}px`
    el.style.height = `${height}px`
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.innerHTML = children
    document.body.append(el)
    el.board = generate({ ...defaultParams(), W, H, seed: 7 }).board
    await el.updateComplete
    await raf()
    await raf()
    return el
  }

  /** Whether a default button or the hint lies over the drawn board by more than half a pixel. */
  function barOverBoard(e: ArrowzBoard): boolean {
    const vp = e.viewport
    const board = e.board
    if (!vp || !board) throw new Error('no viewport')
    const host = e.getBoundingClientRect()
    const box = {
      left: host.left - vp.originX * vp.cellPx,
      top: host.top - vp.originY * vp.cellPx,
      right: host.left + (board.W - vp.originX) * vp.cellPx,
      bottom: host.top + (board.H - vp.originY) * vp.cellPx,
    }
    const parts = [...(e.shadowRoot?.querySelectorAll('.chrome button, .chrome .hint') ?? [])]
    return parts.some((node) => {
      const r = node.getBoundingClientRect()
      const x = Math.min(r.right, box.right) - Math.max(r.left, box.left)
      const y = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)
      return r.width > 0 && x > 0.5 && y > 0.5
    })
  }

  // The lab's board host at 375×812, where the bar covered the bottom row.
  test('a tall board in a narrow host is fitted clear of the default bar', async () => {
    await sized(375, 441, 25, 50)
    expect(barOverBoard(el)).toBe(false)
    expect(el.viewport?.cellPx).toBeLessThan(fit({ W: 25, H: 50, hostWidth: 375, hostHeight: 441, pad: DEFAULT_PAD }).cellPx)
  })

  test('a board with room under it fits as if there were no bar', async () => {
    await sized(832, 282, 25, 50)
    expect(el.viewport).toEqual(reported(fit({ W: 25, H: 50, hostWidth: 832, hostHeight: 282, pad: DEFAULT_PAD })))
  })

  test('a custom controls bar gets no room', async () => {
    await sized(375, 441, 25, 50, { children: '<div slot="controls"><button>x</button></div>' })
    expect(el.viewport).toEqual(reported(fit({ W: 25, H: 50, hostWidth: 375, hostHeight: 441, pad: DEFAULT_PAD })))
  })

  // At 300 px the play hint and four buttons wrap the bar to two rows, 68 px.
  test('a bar wrapped to two rows is kept off the board too', async () => {
    await sized(300, 441, 25, 50, { attrs: { play: '' } })
    expect(barOverBoard(el)).toBe(false)
  })

  test('a host shorter than two bars still draws a finite board', async () => {
    await sized(375, 70, 25, 50)
    const vp = el.viewport
    expect(vp !== null && [vp.cellPx, vp.originX, vp.originY].every(Number.isFinite)).toBe(true)
  })

  // At 300 px `play`'s ☝ and longer hint wrap the bar to a second row: it grows
  // taller, not only wider, so the margin under the board has to grow too.
  test('a bar that grows on a fitted board refits it clear of the bar', async () => {
    await sized(300, 441, 25, 50)
    const before = el.viewport?.cellPx ?? 0
    el.play = true
    await el.updateComplete
    await raf()
    await raf()
    expect(el.viewport?.fitted).toBe(true)
    expect(el.viewport?.cellPx).toBeLessThan(before)
    expect(barOverBoard(el)).toBe(false)
  })

  test('a bar that changes on a zoomed board leaves its scale alone', async () => {
    await sized(300, 441, 25, 50)
    el.play = true
    await el.updateComplete
    await raf()
    await raf()
    el.zoomBy(2)
    await raf()
    const zoomed = el.viewport?.cellPx
    el.play = false
    await el.updateComplete
    await raf()
    await raf()
    expect(el.viewport?.cellPx).toBe(zoomed)
  })

  test('a board moved to another parent keeps following its bar', async () => {
    await sized(300, 441, 25, 50)
    const box = document.createElement('div')
    document.body.append(box)
    box.append(el)
    await raf()
    await raf()
    const before = el.viewport?.cellPx ?? 0
    el.play = true
    await el.updateComplete
    await raf()
    await raf()
    expect(el.viewport?.cellPx).toBeLessThan(before)
    expect(barOverBoard(el)).toBe(false)
    box.remove()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/board-element && pnpm exec vitest run src/arrowz-board.browser.test.ts -t "the default bar and the fit"`
Expected: exactly 4 FAIL — "a tall board in a narrow host is fitted clear of the default bar", "a bar wrapped to two rows is kept off the board too", "a bar that grows on a fitted board refits it clear of the bar", "a board moved to another parent keeps following its bar". The other 4 pass already: they pin what must not change (room under the board, a custom bar, a short host, a zoomed scale).

- [ ] **Step 3: Implement in the element**

In `arrowz-board.ts`:

1. Import line from `./viewport.ts` becomes:

```ts
import {
  fit,
  MIN_POINT_CELL_PX,
  panBy,
  resize,
  screenToCell,
  type Viewport,
  type ViewportInput,
  withBar,
  zoomAt,
  zoomBy,
} from './viewport.ts'
```

(`deno fmt` / the formatter decides the final wrapping; keep the names.)

2. After `private hostHeight = 0` add:

```ts
  /** The default bar's box from the host's bottom-right corner; see `readBar`. */
  private bar: ViewportInput['bar'] = undefined
```

3. In `connectedCallback`, replace the observer block

```ts
    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) this.onResize(entry.contentRect.width, entry.contentRect.height)
    })
    this.observer.observe(this)
```

with

```ts
    // The host and the default bar: a bar that changes size moves the fit.
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this) this.onResize(entry.contentRect.width, entry.contentRect.height)
        else this.syncBar()
      }
    })
    this.observer.observe(this)
    this.observeBar()
```

4. In `render()`, the `controls` slot gets a second listener:

```ts
      <slot name="controls" @click=${this.onAction} @slotchange=${this.onControlsChange}>
```

5. Before `override updated(` add:

```ts
  override firstUpdated(): void {
    // `.chrome` exists from the first render, which comes after connectedCallback.
    this.observeBar()
  }
```

6. Replace `onResize` and add the three helpers after it:

```ts
  private onResize(width: number, height: number): void {
    this.hostWidth = width
    this.hostHeight = height
    this.bar = this.readBar()
    this.syncViewport()
  }

  private observeBar(): void {
    const chrome = this.renderRoot.querySelector('.chrome')
    if (chrome && this.observer) this.observer.observe(chrome)
  }

  /**
   * The default bar's box from the host's bottom-right corner, offset included;
   * undefined when the host's own `controls` replaced it, since the element
   * cannot know where a custom bar sits, or when it is not shown.
   */
  private readBar(): ViewportInput['bar'] {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name="controls"]')
    const chrome = this.renderRoot.querySelector<HTMLElement>('.chrome')
    if (!slot || !chrome || slot.assignedElements().length > 0) return undefined
    const box = chrome.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return undefined
    const host = this.getBoundingClientRect()
    return { width: host.right - box.left, height: host.bottom - box.top }
  }

  /** Follows the bar's box; see `withBar` for what a fitted and a zoomed board do. */
  private syncBar(): void {
    const bar = this.readBar()
    if (bar?.width === this.bar?.width && bar?.height === this.bar?.height) return
    this.bar = bar
    if (this.vp) this.setViewport(withBar(this.vp, bar))
  }

  private readonly onControlsChange = (): void => this.syncBar()
```

Nothing changes in `setViewport`: it sets `this.layer.pad = v.margin` before the `sameViewport` early return, and the layer's `pad` setter schedules a frame, so a zoomed board whose bar changed only the margin repaints its paper without a `viewport-change` (the spec's section 3).

7. In `syncViewport`, replace the last two lines with:

```ts
    const input = { W: board.W, H: board.H, hostWidth: this.hostWidth, hostHeight: this.hostHeight, pad, bar: this.bar }
    // The bar as measured now: `resize` alone keeps the one the viewport was made with.
    this.setViewport(this.vp ? resize({ ...this.vp, bar: this.bar }, input.hostWidth, input.hostHeight) : fit(input))
```

- [ ] **Step 4: Run the new tests**

Run: `cd packages/board-element && pnpm exec vitest run src/arrowz-board.browser.test.ts -t "the default bar and the fit"`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole package and see the fixture tests fail**

Run: `cd packages/board-element && pnpm exec vitest run`
Expected: 14 failures, all from the 30×30 fixture in a 300×300 host, whose 31.6 px bottom margin is under the 40 px bar:
`arrowz-board.browser.test.ts` — "is registered and draws the board fitted to the host", "zoomBy, fit and the buttons move the viewport…", "the wheel zooms towards the cursor…", "keys work when the host is focused", "two zooms in one frame…", "resizing the host refits when fitted", "a double click leaves the viewport alone…", "the board keeps a margin of four cells…", "the pad attribute sets the margin", "removing the pad attribute restores…", "a pad that is not a number fits as the default pad…";
`controls.browser.test.ts` — "a host button in zoom-in replaces the default and zooms", "a key on a focused default control acts on the board", "a key on a focused host control acts on the board".

- [ ] **Step 6: Fix the fixture**

In `arrowz-board.browser.test.ts`, replace

```ts
/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, margin included. */
const FIT = 300 / (30 + 2 * DEFAULT_PAD)
```

with

```ts
/** The default bar's height over the host's bottom edge: 32 px buttons and the 8 px offset. */
const BAR_HEIGHT = 32 + 8
/** The bar as `fit` takes it: any width past the board's right edge collides, so only the height counts. */
const BAR = { width: 300, height: BAR_HEIGHT }
/** The margin the fit keeps so the default bar lies under the 30x30 board in 300 px, not over it. */
const BAR_MARGIN = (BAR_HEIGHT * 30) / (300 - 2 * BAR_HEIGHT)
/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, margin included. */
const FIT = 300 / (30 + 2 * BAR_MARGIN)
```

Change `mount` to take an option and add the empty bar before connecting:

```ts
async function mount(attrs: Record<string, string> = {}, { bar = true } = {}): Promise<ArrowzBoard> {
  el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  // An empty custom bar: no default bar, so the fit reserves nothing for one.
  if (!bar) el.innerHTML = '<span slot="controls"></span>'
```

(the rest of `mount` unchanged). Then:

- "is registered…": `fit({ W: 30, H: 30, hostWidth: 300, hostHeight: 300, pad: DEFAULT_PAD })` → add `, bar: BAR`.
- "zoomBy, fit and the buttons…": the same `bar: BAR` in its `fit({…})`, and `toBeCloseTo(300 / (30 + 2 * DEFAULT_PAD) * 2, 6)` → `toBeCloseTo(FIT * 2, 6)`.
- "the wheel zooms…": `toBeCloseTo(-DEFAULT_PAD, 6)` → `toBeCloseTo(-BAR_MARGIN, 6)`.
- "a double click leaves the viewport alone…": `mount({ play: '' })` → `mount({ play: '' }, { bar: false })` (its click at 40,40 must still land on a piece; the test is about clicks, not the bar).
- "the board keeps a margin of four cells…": `mount()` → `mount({}, { bar: false })`.
- "the pad attribute sets the margin": `mount({ pad: '2' })` → `mount({ pad: '2' }, { bar: false })`.
- "removing the pad attribute restores…": the same change.
- "a pad that is not a number…": `mount({ pad: 'abc' })` → `mount({ pad: 'abc' }, { bar: false })`.
- "keys work…", "two zooms in one frame…", "resizing the host refits…" pass with the new `FIT` unchanged.

In `controls.browser.test.ts`, replace

```ts
/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, margin included. */
const FIT = 300 / (30 + 2 * DEFAULT_PAD)
```

with

```ts
/** The default bar's height over the host's bottom edge: 32 px buttons and the 8 px offset. */
const BAR_HEIGHT = 32 + 8
/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, with the margin that keeps the default bar off it. */
const FIT = 300 / (30 + (2 * BAR_HEIGHT * 30) / (300 - 2 * BAR_HEIGHT))
/** The same without a default bar: a custom `controls` gets no room. */
const FIT_BARE = 300 / (30 + 2 * DEFAULT_PAD)
```

and in "keys typed into a text field in a custom bar reach the field, not the board" change `toBeCloseTo(FIT, 6)` → `toBeCloseTo(FIT_BARE, 6)` (its bar is custom, so its fit has no reservation).

- [ ] **Step 7: Run the whole package**

Run: `cd packages/board-element && pnpm exec vitest run && pnpm nx run board-element:verify`
Expected: all green (the sketch: 24 files, 385 passed, 4 skipped — 368 before, plus 9 in `viewport.test.ts` and 8 new browser tests).

- [ ] **Step 8: Commit**

```bash
git add packages/board-element/src/arrowz-board.ts packages/board-element/src/arrowz-board.browser.test.ts packages/board-element/src/controls.browser.test.ts
git commit -m "Element: measure the default bar and fit the board clear of it

The ResizeObserver watches .chrome as well as the host; the bar's box from
the host's bottom-right corner goes into the viewport, so a fitted board
keeps a margin the bar fits under. A custom controls bar gets no room. The
30x30-in-300px fixture collides too, so its FIT now includes that margin, and
the tests about pad and clicks mount with an empty custom bar."
```

---

### Task 3: The lab's `board-cover` checks the element's bar

**Files:**
- Modify: `apps/lab/src/harness/invariants.ts` (`boardCover`)
- Modify: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` (one new case)

**Interfaces:**
- Consumes: the fitted element from Task 2, through `dist/`.
- Produces: nothing new.

- [ ] **Step 1: Extend the invariant**

In `boardCover`, replace

```ts
    for (const node of wrap.querySelectorAll('.fw-anno, .fw-mode, .fw-solo, .fw-modeline')) {
```

with

```ts
    // The element's own bar too: its buttons and hint, in its shadow root.
    const bar = element.shadowRoot?.querySelectorAll('.chrome button, .chrome .hint') ?? []
    for (const node of [...wrap.querySelectorAll('.fw-anno, .fw-mode, .fw-solo, .fw-modeline'), ...bar]) {
```

and the first sentence of its doc comment with: "The lab's controls around the board and the element's own bar leave the drawn board clear at fit: a piece under one is reachable only by panning."

- [ ] **Step 2: Add the 375×667 case**

After the test "the board state at 375×540 keeps every layout invariant", add:

```ts
// The phone height where the default bar lies furthest over the default 25×50
// board when the fit keeps no room for it (24×20 px under a finger).
test('the board state at 375×667 keeps every layout invariant', async () => {
  await page.viewport(375, 667)
  const screen = await arrange('board')
  await settle()
  expectKnownRed('board@375x667', audit(screen.container, { board: true }))
}, 40_000)
```

- [ ] **Step 3: See the invariant fail without the element's fix**

```bash
git stash push -- packages/board-element/src/viewport.ts packages/board-element/src/arrowz-board.ts
pnpm nx build board-element --skip-nx-cache
(cd apps/lab && pnpm exec vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx)
git stash pop
```

Expected: FAIL with `board-cover: button […] × board […]` and `span.hint […]` findings, 45 cases in the sketch (among them `board` at 1024×768 and 375×812, `violations` at 1440×900 and 1280×800), plus the new 375×667 case.

- [ ] **Step 4: See it pass with the fix**

```bash
pnpm nx build board-element --skip-nx-cache
(cd apps/lab && pnpm exec vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx)
```

Expected: PASS (153 tests: the sketch's 152 and the new case).

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/harness/invariants.ts apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Lab: board-cover checks the element's own bar

The invariant read only the lab's overlays, so the element's buttons and hint
over the board's bottom row never went red. With the bar included, 45 cases
of the layout matrix fail on the old fit and all pass with the new one; a
375x667 case pins the phone height with the largest overlap."
```

---

### Task 4: Documentation

**Files:**
- Modify: `packages/board-element/README.md` ("The margin", "Slots and custom controls")
- Modify: `apps/lab/docs-content/en/element.md` (`## The margin {#margin}`)
- Modify: `apps/lab/docs-content/pl/element.md` (`## Margines {#margin}`)

**Interfaces:** none.

- [ ] **Step 1: README, "The margin"**

After the paragraph that ends "the attribute and the property keep whatever was set.", add:

```markdown
The default bar in the corner counts too. When it would lie over the fitted
board, the margin is widened until the part under the board is as tall as the
bar and its offset; the board stays centred, so the margin grows on every
side. A board with room under it fits as before. A bar of the host's own, in
the `controls` slot, gets no such room, since the element cannot know where it
sits, and a `pad` of `0` stays `0`: an empty custom `controls` hides the bar
for an unobstructed edge-to-edge board.
```

- [ ] **Step 2: README, "Slots and custom controls"**

After its first paragraph ("…and a slot left empty keeps it."), add:

```markdown
Filling `controls` also gives up the room the fit keeps under the board for
the default bar (see "The margin").
```

- [ ] **Step 3: `element.md`, English**

After the paragraph ending "asking for no margin is not asking for a small one." in `## The margin {#margin}`, add:

```markdown
The element's own bar in the corner counts too. When it would lie over the fitted board, the margin is widened until the part under the board is as tall as the bar; the board stays centred. A board with room under it fits as before. A bar of your own in the `controls` slot gets no such room, since the element cannot know where you put it, and a `pad` of `0` stays `0`.
```

- [ ] **Step 4: `element.md`, Polish**

After the paragraph ending "prośba o brak marginesu to nie prośba o mały margines." in `## Margines {#margin}`, add:

```markdown
Liczy się też pasek przycisków w rogu komponentu. Gdy przy dopasowaniu zasłoniłby planszę, margines jest poszerzany, aż część pod planszą ma wysokość paska; plansza zostaje na środku. Plansza, pod którą jest dość miejsca, jest dopasowana tak jak dotąd. Własny pasek w slocie `controls` takiego miejsca nie dostaje, bo komponent nie wie, gdzie go umieścisz, a `pad` równe `0` zostaje `0`.
```

- [ ] **Step 5: Run the guards that read these files**

```bash
(cd packages/board-element && pnpm exec vitest run src/readme-api.test.ts src/docs-api.browser.test.ts)
(cd apps/lab && pnpm exec vitest run --project node src/docs src/readme.test.ts)
(cd packages/engine && deno test -A glossary.test.ts)
```

Expected: PASS — in the sketch 24, 275 and 11 tests. `glossary.test.ts` reads `apps/lab/docs-content`: if it rejects a word in the Polish paragraph, use the word it asks for.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/README.md apps/lab/docs-content/en/element.md apps/lab/docs-content/pl/element.md
git commit -m "Docs: the fit keeps room for the default bar

README and the lab's Element page say, in English and Polish, that the margin
widens when the default bar would cover the fitted board, that a custom
controls bar gets no room, and that pad 0 stays edge to edge."
```

---

### Task 5: Whole-repository gate and PR

**Files:** none new.

- [ ] **Step 1: Full verify**

```bash
pnpm nx run-many -t verify --skip-nx-cache --parallel=1
pnpm nx daemon --stop
```

Expected: every project green (lab 1857 tests: 1856 plus the 375×667 case).

- [ ] **Step 2: Push and open the PR**

Write the body to a file first, then run `gh pr create` alone (the bead guard reads the first message in a command):

```bash
git push -u origin board-element/bar-clear-fit
```

Body (`/tmp/arrowz-6ce-body.md`): what the bar covered (the spec's table), what `fit()` does now, what a page sees (cell 7.6 → 7.2 px at 375×812; no change where the bar lies clear; custom `controls` and `pad = 0` unchanged), the 45 red cases of `board-cover` turned green, the test commands run, and the last line `Bead: arrowz-6ce`.

```bash
gh pr create --title "The element's own bar keeps clear of the fitted board" --body-file /tmp/arrowz-6ce-body.md
```

Then confirm the link: `bd show arrowz-6ce | grep -i external`.
