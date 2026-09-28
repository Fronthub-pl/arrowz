# Board controls through slots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host of `<arrowz-board>` can project its own hint, buttons or whole control bar through named slots; the element's own controls become slot fallback content.

**Architecture:** The shadow template nests per-control slots inside the fallback of one `controls` slot. One click listener on that slot runs the action named by `data-board-action`, for default and host controls alike. A private `syncActions()`, driven by `updated()` and a `MutationObserver`, writes `aria-pressed` and `hidden` on the host's colour and gesture controls.

**Tech Stack:** Lit 3, TypeScript, Vitest 5 browser mode (Playwright, Chromium), Deno 2.9 for the engine's docs guard.

**Spec:** `docs/superpowers/specs/2026-09-28-board-controls-slots-design.md`

## Global Constraints

- Everything written to the repository is in English: code, comments, tests, README, commit messages.
- No `any`, no non-null assertions (`!`), no `as` casts added to production code.
- Comments say why, once, in the fewest lines; no block over 6 lines unless it is a module or API header (≤ 24 lines); no history, PR or task references in comments. `packages/engine/comments.test.ts` enforces this over `packages/board-element/src`.
- Commit messages carry no attribution lines.
- With no slotted content the element renders, behaves and is labelled exactly as before: every existing test passes with no assertion edits.
- Prose in `packages/engine/lab-docs.ts` must not name the browser's key-value store by its API name and must not end a sentence with `document`, `window`, `process` or `Deno` (`neutral.test.ts` greps the text).
- `toggleColors` and `toggleGestures` are ordinary class methods, never arrow fields: the engine's member parser and the prototype check see prototype methods only.
- The attribute is `data-board-action`; its values are exactly `zoom-in`, `zoom-out`, `fit`, `colors`, `gestures`.

## Measured facts this plan relies on

Measured on 2026-09-28 in this package's Chromium project (throwaway probes, deleted):

- `cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })` from `vitest/browser` makes `matchMedia('(pointer: coarse)').matches` true at once; `{ enabled: false }` restores it. (The lab's `touch.browser.test.tsx` says the runner cannot emulate a coarse pointer; that holds for its approach, not for CDP.)
- `display: none` on a `<slot>` hides both its fallback and its assigned nodes (`checkVisibility()` false).
- A slot's fallback may contain slots. When the outer slot gets an assigned node, the inner slots' fallback and their assigned nodes all stop rendering (`checkVisibility()` false).
- A click on fallback content and a click on assigned content (also on a child of an assigned element) both reach a listener on the slot; `composedPath()` starts at the real target.
- A listener on an outer slot sees, in `composedPath()`, the nodes inside a **nested** element's open shadow root before that element's host: `BUTTON>SLOT>ROOT>DIV#inner>SLOT>…`. The nested-board guard in the click handler is therefore load-bearing.

## Review Focus

1. A host framework adds or replaces a control deep inside an already assigned bar after connect: the control must still get `aria-pressed`/`hidden` (Task 3, "a control added deep inside the bar after connect gets its state").
2. A click lands on an icon inside a host button (a `<span>` or `<svg>` child), not on the button: the action must still run (Task 2, "a host button in zoom-in replaces the default and zooms").
3. A board is nested inside another board's projected content: neither board acts on, nor writes state onto, the other's controls (Task 2 "a click on a nested board's default control leaves the outer board alone"; Task 3 "a nested board's controls are not the outer board's").
4. The element is moved (removed and re-appended): the observer must watch again, so a control added after the move still gets its state (Task 3, same test as 1).
5. A typo in `data-board-action`: nothing happens and nothing throws (Task 2, "an unknown action does nothing").

---

### Task 1: Public toggles, `colored` getter and `gestures-change`

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (event types near `ColoredChangeEvent`; `toggleGestures`, `toggleColors`, `colored`; the two `@click` bindings in `render()`)
- Modify: `packages/board-element/src/mod.ts` (type imports, type exports, `HTMLElementEventMap`)
- Modify: `packages/engine/lab-docs.ts` (`ELEMENT_MEMBERS`, `ELEMENT_EVENTS`, `EN` and `PL` texts)
- Modify: `packages/board-element/README.md` (method table, getter paragraphs, event table)
- Create: `packages/board-element/src/controls.browser.test.ts`

**Interfaces:**
- Produces:
  - `ArrowzBoard.prototype.toggleColors(): void`
  - `ArrowzBoard.prototype.toggleGestures(): void`
  - `get ArrowzBoard.prototype.colored: boolean`
  - `export type GesturesChangeEvent = CustomEvent<{ mode: GestureMode }>`, `export type GesturesChangeDetail = GesturesChangeEvent['detail']` from `arrowz-board.ts` and `mod.ts`
  - event `'gestures-change'` in `HTMLElementEventMap`
  - test helpers in `controls.browser.test.ts`: `mount(attrs?, children?)`, `shadow(selector)`, `raf()`, module-level `el`

- [ ] **Step 1: Create the test file with its helpers and the API tests**

Create `packages/board-element/src/controls.browser.test.ts`:

```ts
import { defaultParams, generate } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { type ArrowzBoard, GESTURE_STORAGE_KEY } from './arrowz-board.ts'
import './mod.ts'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

let el: ArrowzBoard
/** Mounts a 300 px board whose light DOM is `children`, parsed before the element connects. */
async function mount(attrs: Record<string, string> = {}, children = ''): Promise<ArrowzBoard> {
  el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.innerHTML = children
  document.body.append(el)
  el.board = generate({ ...defaultParams(), W: 30, H: 30, seed: 7 }).board
  await el.updateComplete
  await raf() // the ResizeObserver delivers the host size on its own frame
  await raf()
  return el
}

/** An element of the shadow tree, fallback controls included. */
function shadow(selector: string): HTMLElement {
  const node = el.shadowRoot?.querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`no ${selector} in the shadow root`)
  return node
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.removeItem(GESTURE_STORAGE_KEY)
})
afterEach(() => {
  el?.remove()
})

describe('the public toggles', () => {
  test('toggleColors without enable-colors changes nothing and announces nothing', async () => {
    await mount({ play: '' })
    const seen: boolean[] = []
    el.addEventListener('colored-change', (e) => seen.push(e.detail.colored))
    el.toggleColors()
    await el.updateComplete
    expect(seen).toEqual([])
    expect(el.colored).toBe(false)
  })

  test('toggleColors with the permission does what the colour button does', async () => {
    await mount({ 'enable-colors': '' })
    const seen: boolean[] = []
    el.addEventListener('colored-change', (e) => seen.push(e.detail.colored))
    el.toggleColors()
    await el.updateComplete
    expect(seen).toEqual([true])
    expect(el.colored).toBe(true)
    expect(shadow('button.colors').getAttribute('aria-pressed')).toBe('true')
  })

  test('toggleGestures on a board that only pans changes nothing and announces nothing', async () => {
    await mount()
    const seen: string[] = []
    el.addEventListener('gestures-change', (e) => seen.push(e.detail.mode))
    el.toggleGestures()
    await el.updateComplete
    expect(seen).toEqual([])
    expect(el.gestureMode).toBe('drag')
    expect(localStorage.getItem(GESTURE_STORAGE_KEY)).toBeNull()
  })

  test('toggleGestures flips and stores the choice and announces each change once', async () => {
    await mount({ play: '' })
    const seen: string[] = []
    const onDocument = (e: Event) => seen.push(e.type)
    document.addEventListener('gestures-change', onDocument)
    const modes: string[] = []
    el.addEventListener('gestures-change', (e) => modes.push(e.detail.mode))
    el.toggleGestures()
    await el.updateComplete
    expect(el.gestureMode).toBe('click')
    expect(localStorage.getItem(GESTURE_STORAGE_KEY)).toBe('click')
    el.toggleGestures()
    await el.updateComplete
    document.removeEventListener('gestures-change', onDocument)
    expect(modes).toEqual(['click', 'drag'])
    expect(seen).toEqual(['gestures-change', 'gestures-change'])
    expect(shadow('button.gestures').getAttribute('aria-pressed')).toBe('false')
  })

  test('the default gesture switch announces gestures-change too', async () => {
    await mount({ interactive: '' })
    const modes: string[] = []
    el.addEventListener('gestures-change', (e) => modes.push(e.detail.mode))
    shadow('button.gestures').click()
    await el.updateComplete
    expect(modes).toEqual(['click'])
  })

  test('a choice read back on connect is not announced', async () => {
    localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
    const seen: Event[] = []
    const onDocument = (e: Event) => seen.push(e)
    document.addEventListener('gestures-change', onDocument)
    await mount({ play: '' })
    document.removeEventListener('gestures-change', onDocument)
    expect(el.gestureMode).toBe('click')
    expect(seen).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run (from `packages/board-element`): `npx vitest run --project chromium src/controls.browser.test.ts`
Expected: FAIL — `el.toggleColors is not a function` / `el.toggleGestures is not a function`, and `el.colored` is `undefined` where it is read.

- [ ] **Step 3: Add the event types**

In `packages/board-element/src/arrowz-board.ts`, after the line `export type ColoredChangeDetail = ColoredChangeEvent['detail']`, add:

```ts
export type GesturesChangeEvent = CustomEvent<{ mode: GestureMode }>
export type GesturesChangeDetail = GesturesChangeEvent['detail']
```

- [ ] **Step 4: Turn the two private arrow fields into guarded public methods**

In `arrowz-board.ts`, replace the whole block

```ts
  private readonly toggleGestures = (): void => {
    this.chosenMode = this.chosenMode === 'click' ? 'drag' : 'click'
    storeMode(this.chosenMode)
  }
```

with

```ts
  /** What the ☝ button does; a no-op on a board a click can neither play nor inspect. */
  toggleGestures(): void {
    if (!this.playable) return
    this.chosenMode = this.chosenMode === 'click' ? 'drag' : 'click'
    storeMode(this.chosenMode)
    this.dispatchEvent(
      new CustomEvent<GesturesChangeDetail>('gestures-change', {
        detail: { mode: this.chosenMode },
        bubbles: true,
        composed: true,
      }),
    )
  }
```

Replace the `toggleColors` block (keep its JSDoc, add one sentence at its end) so it reads:

```ts
  /**
   * Announces the colour choice before acting on it: a host may run its own
   * storage under `colored-change` and call `preventDefault()` to hand the
   * decision to `view.colored` instead. Cancelling clears any override this
   * button or `loadState` set earlier, not merely skips setting a new one —
   * otherwise a cancelling host would only take charge starting from a board
   * that had never been coloured, and every other one would still be stuck on
   * whatever the override last was. A host that never cancels leaves the
   * button to decide. Without `enableColors` it does nothing.
   */
  toggleColors(): void {
    if (!this.enableColors) return
    const colored = !this.colored
    const event = new CustomEvent<ColoredChangeDetail>('colored-change', {
      detail: { colored },
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    this.coloredOverride = this.dispatchEvent(event) ? colored : null
  }
```

This JSDoc is an API header (a `/** */` block right above a declaration), so its 9 lines are within the 24-line limit.

In `render()`, change `@click=${this.toggleColors}` to `@click=${() => this.toggleColors()}` and `@click=${this.toggleGestures}` to `@click=${() => this.toggleGestures()}`.

Make the getter public: change `  private get colored(): boolean {` to `  get colored(): boolean {`. Its JSDoc stays.

- [ ] **Step 5: Export the types and map the event**

In `packages/board-element/src/mod.ts`:
- add `GesturesChangeEvent,` to the `import type { … } from './arrowz-board.ts'` list (alphabetical, after `FinishedEvent,`);
- add `GesturesChangeDetail,` and `GesturesChangeEvent,` to the `export type { … } from './arrowz-board.ts'` list (after `FinishedEvent,`);
- add `    'gestures-change': GesturesChangeEvent` to `interface HTMLElementEventMap`, after `'colored-change': ColoredChangeEvent`.

- [ ] **Step 6: Run the new tests and see them pass**

Run: `npx vitest run --project chromium src/controls.browser.test.ts`
Expected: 6 passed.

- [ ] **Step 7: Mutations — each must turn exactly the named test red, then revert**

1. Delete `if (!this.enableColors) return` from `toggleColors` → red: "toggleColors without enable-colors…" on `expect(seen).toEqual([])`. Control: "toggleColors with the permission…" stays green.
2. Delete `if (!this.playable) return` from `toggleGestures` → red: "toggleGestures on a board that only pans…" on `expect(seen).toEqual([])`. Control: "toggleGestures flips…" stays green.
3. Delete the `this.dispatchEvent(…)` call from `toggleGestures` → red: "toggleGestures flips…" on `expect(modes)` and "the default gesture switch announces…". Control: "a choice read back on connect…" stays green.
4. Add `this.dispatchEvent(new CustomEvent('gestures-change', { detail: { mode: this.chosenMode }, bubbles: true, composed: true }))` right after `this.chosenMode = storedMode()` in `connectedCallback` → red: "a choice read back on connect is not announced". Revert.

Run after each: `npx vitest run --project chromium src/controls.browser.test.ts`.

- [ ] **Step 8: Document the members and the event for the engine's guard**

In `packages/engine/lab-docs.ts`, in `ELEMENT_MEMBERS`, after the `gestureMode` row add

```ts
  { key: 'colored', kind: 'getter', signature: 'boolean' },
```

and after the `zoomBy` row add

```ts
  { key: 'toggleColors', kind: 'method', signature: 'toggleColors(): void' },
  { key: 'toggleGestures', kind: 'method', signature: 'toggleGestures(): void' },
```

In `ELEMENT_EVENTS`, after the `colored-change` row add

```ts
  { key: 'gestures-change', detail: '{ mode }' },
```

In `EN.members`, after `gestureMode`, add

```ts
    colored: "Whether the board is drawn in colour now: the permission first, then the button's choice, then `view.colored`.",
```

and after `zoomBy` add

```ts
    toggleColors:
      'What the colour button does, the cancelable `colored-change` included. Does nothing without `enableColors`.',
    toggleGestures:
      "What the gesture switch does: flips the player's choice, keeps it for the next visit and fires `gestures-change`. Does nothing on a board a click cannot reach.",
```

In `EN.events`, replace the `'colored-change'` text with

```ts
    'colored-change':
      'The colour button was clicked or `toggleColors()` was called; cancelable, and fired before the override changes. Cancelling clears the override instead, handing the colour back to `view.colored`.',
```

and after it add

```ts
    'gestures-change':
      "The player's gesture choice changed, through the switch or `toggleGestures()`. Not fired for the choice read back on connect.",
```

In `PL.members`, after `gestureMode`, add

```ts
    colored: 'Czy plansza jest teraz rysowana w kolorze: najpierw zgoda, potem wybór przycisku, potem `view.colored`.',
```

and after `zoomBy` add

```ts
    toggleColors: 'To samo co przycisk koloru, łącznie z anulowalnym `colored-change`. Bez `enableColors` nic nie robi.',
    toggleGestures:
      'To samo co przełącznik gestów: odwraca wybór gracza, zapamiętuje go na następną wizytę i wysyła `gestures-change`. Na planszy, do której klik nie dociera, nic nie robi.',
```

In `PL.events`, replace the `'colored-change'` text with

```ts
    'colored-change':
      'Kliknięto przycisk koloru albo wywołano `toggleColors()`; można je anulować, leci przed zmianą nadpisania. Anulowanie czyści nadpisanie i oddaje kolor `view.colored`.',
```

and after it add

```ts
    'gestures-change':
      'Zmienił się wybór gestu gracza, przełącznikiem albo przez `toggleGestures()`. Nie leci przy odczycie zapamiętanego wyboru po podłączeniu.',
```

Run `deno fmt lab-docs.ts` in `packages/engine` so line breaks match the formatter.

- [ ] **Step 9: Update the README tables**

In `packages/board-element/README.md`:

In the method table, after the `zoomBy(factor)` row add

```md
| `toggleColors()` | what the ◑ button does, `colored-change` included; does nothing without `enableColors` |
| `toggleGestures()` | what the ☝ button does, the stored choice included; fires `gestures-change`; does nothing on a board that is neither `interactive` nor `play` |
```

After the paragraph starting `Getter: \`gestureMode\``, add

```md
Getter: `colored` (`boolean`, read-only): whether the board is drawn in colour
now — never without `enableColors`, then the button's choice, then
`view.colored`.
```

In the event table, replace the `colored-change` row with

```md
| `colored-change` | `{ colored }`, cancelable: fired by the ◑ button or `toggleColors()` before the colour override changes; `preventDefault()` clears the override instead, handing the colour back to `view.colored` |
```

and after it add

```md
| `gestures-change` | `{ mode }` (`'drag'` or `'click'`): the player's gesture choice changed, through the ☝ button or `toggleGestures()`; not fired for the choice read back on connect |
```

- [ ] **Step 10: Run the gates this task touches**

Run, from `packages/engine`: `deno task test`
Expected: all pass (the docs guard sees `colored`, `toggleColors`, `toggleGestures` and `gestures-change` in both directions, and `pl` differs from `en` for each).

Run, from the repository root: `pnpm nx run board-element:verify --skip-nx-cache`
Expected: check, lint, fmt, test and build succeed; the existing chromium tests pass unedited.

Run: `pnpm nx run lab:test --skip-nx-cache`
Expected: pass (the docs page tests count rows from the tables, so the new rows are expected there automatically).

- [ ] **Step 11: Commit**

```bash
git add packages/board-element/src/arrowz-board.ts packages/board-element/src/mod.ts packages/board-element/src/controls.browser.test.ts packages/board-element/README.md packages/engine/lab-docs.ts
git commit -m "Board element: toggleColors, toggleGestures and colored are public; gestures-change announces the player's choice"
```

---

### Task 2: The slot tree, one click path, the touch rule on slots

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (module header line 1–5, `static styles` coarse rule, `render()`, new private `onAction` and `act`)
- Modify: `packages/board-element/src/controls.browser.test.ts`

**Interfaces:**
- Consumes: `toggleColors()`, `toggleGestures()` from Task 1; test helpers `mount`, `shadow`, `raf`, `el`.
- Produces (tests): helpers `light(selector)` and `FIT`, used again by Task 3.
- Produces: slots `controls`, `hint`, `zoom-in`, `zoom-out`, `fit`, `colors`, `gestures`; default buttons carrying `data-board-action`; `private readonly onAction: (e: Event) => void` bound on `<slot name="controls">`.

- [ ] **Step 1: Write the failing tests**

In `controls.browser.test.ts`, extend the import from `./arrowz-board.ts` to `{ type ArrowzBoard, DEFAULT_PAD, GESTURE_STORAGE_KEY, ZOOM_STEP }`, add `import { cdp } from 'vitest/browser'` after the `vitest` import, and add after `raf`:

```ts
/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, margin included. */
const FIT = 300 / (30 + 2 * DEFAULT_PAD)
```

and before `shadow`:

```ts
/** An element of the host's own content. */
function light(selector: string): HTMLElement {
  const node = el.querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`no ${selector} in the light DOM`)
  return node
}
```

Append:

```ts
describe('slots', () => {
  const actionsOf = () =>
    [...(el.shadowRoot?.querySelectorAll('[data-board-action]') ?? [])].map((n) => n.getAttribute('data-board-action'))

  test('the default controls name their actions', async () => {
    await mount()
    expect(actionsOf()).toEqual(['zoom-in', 'zoom-out', 'fit'])
    await mount({ 'enable-colors': '', play: '' })
    expect(actionsOf()).toEqual(['zoom-in', 'zoom-out', 'fit', 'colors', 'gestures'])
  })

  test('a host button in zoom-in replaces the default and zooms', async () => {
    await mount({}, '<button slot="zoom-in" data-board-action="zoom-in" id="mine"><span id="icon">Z</span></button>')
    expect(shadow('[data-board-action="zoom-in"]').checkVisibility()).toBe(false)
    expect(light('#mine').checkVisibility()).toBe(true)
    expect(shadow('[data-board-action="fit"]').checkVisibility()).toBe(true)
    light('#icon').click()
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(FIT * ZOOM_STEP, 6)
  })

  test('a custom controls bar replaces the whole default bar and switches the per-control slots off', async () => {
    await mount(
      {},
      '<div slot="controls" id="bar"><button data-board-action="fit" id="f">F</button></div>' +
        '<button slot="fit" data-board-action="fit" id="lone">L</button>',
    )
    expect(shadow('.chrome').checkVisibility()).toBe(false)
    expect(light('#lone').checkVisibility()).toBe(false)
    expect(light('#bar').checkVisibility()).toBe(true)
    el.zoomBy(2)
    await raf()
    expect(el.viewport?.fitted).toBe(false)
    light('#f').click()
    await raf()
    expect(el.viewport?.fitted).toBe(true)
  })

  test('host colour and gesture controls render only where the default would', async () => {
    await mount(
      {},
      '<button slot="colors" data-board-action="colors" id="c">C</button>' +
        '<button slot="gestures" data-board-action="gestures" id="g">G</button>',
    )
    expect(light('#c').checkVisibility()).toBe(false)
    expect(light('#g').checkVisibility()).toBe(false)
    el.setAttribute('enable-colors', '')
    await el.updateComplete
    expect(light('#c').checkVisibility()).toBe(true)
    el.play = true
    await el.updateComplete
    expect(light('#g').checkVisibility()).toBe(true)
    el.play = false
    el.interactive = true
    await el.updateComplete
    expect(light('#g').checkVisibility()).toBe(true)
    el.interactive = false
    await el.updateComplete
    expect(light('#g').checkVisibility()).toBe(false)
  })

  test('an unknown action does nothing', async () => {
    await mount(
      { 'enable-colors': '', play: '' },
      '<button slot="fit" data-board-action="sideways" id="odd">?</button>',
    )
    const before = el.viewport
    light('#odd').click()
    await raf()
    expect(el.viewport).toEqual(before)
    expect(el.colored).toBe(false)
    expect(el.gestureMode).toBe('drag')
  })

  test("a click on a nested board's default control leaves the outer board alone", async () => {
    await mount({}, '<div slot="controls"><arrowz-board></arrowz-board></div>')
    const innerBoard = el.querySelector('arrowz-board')
    if (!innerBoard) throw new Error('no inner board')
    innerBoard.style.cssText = 'display:block;width:100px;height:100px'
    innerBoard.board = generate({ ...defaultParams(), W: 10, H: 10, seed: 3 }).board
    await innerBoard.updateComplete
    await raf()
    await raf()
    const outerBefore = el.viewport
    const innerBefore = innerBoard.viewport?.cellPx ?? 0
    innerBoard.shadowRoot?.querySelector<HTMLElement>('[data-board-action="zoom-in"]')?.click()
    await raf()
    expect(innerBoard.viewport?.cellPx).toBeGreaterThan(innerBefore)
    expect(el.viewport).toEqual(outerBefore)
  })

  // CDP touch emulation is the only way this runner reports a coarse pointer.
  test('under a coarse pointer the hint and gesture slots hide host content and fallback alike', async () => {
    await mount({ play: '' }, '<span slot="hint" id="h">H</span>')
    const session = cdp()
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    try {
      expect(matchMedia('(pointer: coarse)').matches).toBe(true)
      expect(light('#h').checkVisibility()).toBe(false)
      expect(shadow('button.gestures').checkVisibility()).toBe(false)
      expect(shadow('[data-board-action="fit"]').checkVisibility()).toBe(true)
    } finally {
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: false })
    }
    expect(light('#h').checkVisibility()).toBe(true)
  })
})
```

`el.querySelector('arrowz-board')` is typed `ArrowzBoard | null` through `HTMLElementTagNameMap` in `mod.ts`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project chromium src/controls.browser.test.ts`
Expected, per test:
- "the default controls name their actions": FAIL, `[]` instead of the list.
- "a host button in zoom-in…": FAIL on `light('#mine').checkVisibility()` (no slot, so the host button is not rendered).
- "a custom controls bar…": FAIL on `light('#bar').checkVisibility()`.
- "host colour and gesture controls…": FAIL on the first `toBe(true)`.
- "an unknown action does nothing": PASS today (an unassigned node's click reaches no listener); it is pinned by mutation 5 below.
- "a click on a nested board's default control…": FAIL, the inner board is not rendered, so it gets no size and no viewport (`cellPx` stays undefined).
- the coarse test: FAIL on its last line — without a `hint` slot the span is never rendered, emulation or not.

- [ ] **Step 3: Rewrite `render()` as the slot tree**

Replace the body of `render()` in `arrowz-board.ts` with:

```ts
  override render() {
    const l = labelsFor(this.lang)
    return html`
      ${this.hasWebgl ? this.layer.canvas : html`<p class="unsupported">${l.noWebgl}</p>`}
      <slot name="controls" @click=${this.onAction}>
        <div class="chrome">
          <slot name="hint"><span class="hint">${this.hint(l)}</span></slot>
          <slot name="zoom-in">
            <button type="button" data-board-action="zoom-in" title=${l.zoomIn} aria-label=${l.zoomIn}>+</button>
          </slot>
          <slot name="zoom-out">
            <button type="button" data-board-action="zoom-out" title=${l.zoomOut} aria-label=${l.zoomOut}>−</button>
          </slot>
          <slot name="fit">
            <button type="button" data-board-action="fit" title=${l.fit} aria-label=${l.fit}>⤢</button>
          </slot>
          ${this.enableColors
            ? html`
              <slot name="colors">
                <button
                  type="button"
                  class="colors"
                  data-board-action="colors"
                  title=${l.colors}
                  aria-label=${l.colors}
                  aria-pressed=${this.colored ? 'true' : 'false'}
                >◑</button>
              </slot>
            `
            : ''}
          ${this.playable
            ? html`
              <slot name="gestures">
                <button
                  type="button"
                  class="gestures"
                  data-board-action="gestures"
                  title=${this.gesturesLabel(l)}
                  aria-label=${this.gesturesLabel(l)}
                  aria-pressed=${this.chosenMode === 'click' ? 'true' : 'false'}
                >☝</button>
              </slot>
            `
            : ''}
        </div>
      </slot>
    `
  }
```

`deno fmt` owns the line breaks inside the template; run it and accept its layout. Whitespace text nodes between a `<slot>` tag and its `<button>` are harmless: the slots are `display: contents` and the chrome is a flex row, which drops whitespace-only text.

- [ ] **Step 4: Add the click handler**

After `gesturesLabel` in `arrowz-board.ts`, add:

```ts
  /**
   * The one click path for the default controls and the host's: the first
   * element with `data-board-action` between the target and the `controls`
   * slot names the action. A board nested in the host's content sits on that
   * path above its own shadow controls, so meeting one means the click is its.
   */
  private readonly onAction = (e: Event): void => {
    const path = e.composedPath()
    const end = e.currentTarget === null ? -1 : path.indexOf(e.currentTarget)
    const inside = end < 0 ? [] : path.slice(0, end)
    if (inside.some((node) => node instanceof ArrowzBoard && node !== this)) return
    const source = inside.find((node): node is Element => node instanceof Element && node.hasAttribute('data-board-action'))
    this.act(source?.getAttribute('data-board-action') ?? null)
  }

  private act(action: string | null): void {
    if (action === 'zoom-in') this.zoomBy(ZOOM_STEP)
    else if (action === 'zoom-out') this.zoomBy(1 / ZOOM_STEP)
    else if (action === 'fit') this.fit()
    else if (action === 'colors') this.toggleColors()
    else if (action === 'gestures') this.toggleGestures()
  }
```

`act` is `private`, so the engine's member parser skips it.

- [ ] **Step 5: Move the touch rule onto the slots**

In `static styles`, replace

```css
    @media (pointer: coarse) {
      .hint,
      .gestures {
        display: none;
      }
    }
```

with

```css
    /* On a slot, so a host's hint or switch hides with the default one. */
    @media (pointer: coarse) {
      slot[name='hint'],
      slot[name='gestures'] {
        display: none;
      }
    }
```

- [ ] **Step 6: Update the module header**

Replace lines 1–5 of `arrowz-board.ts` with:

```ts
// The board element: a Lit shell for the chrome (zoom buttons, pan hint)
// around one <canvas> owned by GlLayer. Lit never renders the pieces; it
// renders the handful of nodes around them. The chrome is slot fallback
// content, so a host may project its own controls (README, "Slots and
// custom controls"). The viewport is pure math from viewport.ts, the pointer
// rules are the state machine of gestures.ts, and this file only wires DOM
// events to both and exposes the public API.
```

- [ ] **Step 7: Run all tests of the package and see them pass**

Run: `npx vitest run --project chromium src/controls.browser.test.ts`
Expected: all pass.

Run: `pnpm nx run board-element:test --skip-nx-cache`
Expected: all pass, the pre-existing tests unedited (they find three `button`s, `button.gestures`, `button.colors` and `.hint` in the shadow root, now inside the fallback).

- [ ] **Step 8: Mutations — each must turn the named test red, then revert**

1. Remove the `<slot name="zoom-in">` wrapper (leave its button) → red: "a host button in zoom-in replaces the default…" on the first `checkVisibility()`. Control: its `fit` assertion stays true.
2. Move `<slot name="controls" …>` inside `.chrome` (wrapping only the five inner slots) → red: "a custom controls bar replaces the whole default bar…" on `shadow('.chrome').checkVisibility()`.
3. Render `<slot name="colors">` unconditionally (drop the `this.enableColors ?` branch, keep the slot) → red: "host colour and gesture controls render only where the default would" on the first `#c` assertion.
4. Delete the `if (inside.some(…)) return` line → red: "a click on a nested board's default control leaves the outer board alone" on `expect(el.viewport).toEqual(outerBefore)`.
5. Change `act`'s last branch from `else if (action === 'gestures') this.toggleGestures()` to `else this.toggleGestures()` → red: "an unknown action does nothing" on `expect(el.gestureMode).toBe('drag')`.
6. Restore `.hint, .gestures` as the coarse selectors → red: the coarse test on `light('#h').checkVisibility()` being `true`. Control: the `fit` assertion stays true.
7. Change `node.hasAttribute('data-board-action')` to `node === e.target && node instanceof Element && node.hasAttribute('data-board-action')` → red: "a host button in zoom-in…" (the click lands on `#icon`, whose parent carries the action).

- [ ] **Step 9: Package gate**

Run: `pnpm nx run board-element:verify --skip-nx-cache`
Expected: check, lint, fmt, test, build succeed. If `tsc` rejects the `cdp().send` parameters, type the call through the command name only (`session.send('Emulation.setTouchEmulationEnabled', …)` is already that); report the exact error rather than adding a cast.

Run, from `packages/engine`: `deno test -A comments.test.ts`
Expected: pass (the new comment blocks are within limits).

- [ ] **Step 10: Commit**

```bash
git add packages/board-element/src/arrowz-board.ts packages/board-element/src/controls.browser.test.ts
git commit -m "Board element: the chrome is slot fallback content, and one click path serves default and host controls"
```

---

### Task 3: State on host controls

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (new field `actionObserver`, `connectedCallback`, `disconnectedCallback`, `updated()`, new private `syncActions`)
- Modify: `packages/board-element/src/controls.browser.test.ts`

**Interfaces:**
- Consumes: `colored`, `chosenMode`, `enableColors`, `playable` (private getter), the slot tree from Task 2.
- Produces: `aria-pressed` and `hidden` on light-DOM `[data-board-action="colors"]` and `[data-board-action="gestures"]` owned by this board.

- [ ] **Step 1: Write the failing tests**

Append to `controls.browser.test.ts`:

```ts
describe('state on host controls', () => {
  test('a host colour control is pressed after its click and after view.colored', async () => {
    await mount({ 'enable-colors': '' }, '<button slot="colors" data-board-action="colors" id="c">C</button>')
    expect(light('#c').getAttribute('aria-pressed')).toBe('false')
    light('#c').click()
    await el.updateComplete
    expect(el.colored).toBe(true)
    expect(light('#c').getAttribute('aria-pressed')).toBe('true')

    await mount({ 'enable-colors': '' }, '<button slot="colors" data-board-action="colors" id="c">C</button>')
    el.view = { colored: true }
    await el.updateComplete
    expect(light('#c').getAttribute('aria-pressed')).toBe('true')
  })

  test('a host gesture control is pressed in click mode', async () => {
    await mount({ play: '' }, '<button slot="gestures" data-board-action="gestures" id="g">G</button>')
    expect(light('#g').getAttribute('aria-pressed')).toBe('false')
    light('#g').click()
    await el.updateComplete
    expect(el.gestureMode).toBe('click')
    expect(light('#g').getAttribute('aria-pressed')).toBe('true')
  })

  test('hidden on controls in a custom bar follows enable-colors and play', async () => {
    await mount(
      {},
      '<div slot="controls"><button data-board-action="colors" id="c">C</button>' +
        '<button data-board-action="gestures" id="g">G</button></div>',
    )
    expect(light('#c').hidden).toBe(true)
    expect(light('#g').hidden).toBe(true)
    el.setAttribute('enable-colors', '')
    await el.updateComplete
    expect(light('#c').hidden).toBe(false)
    expect(light('#g').hidden).toBe(true)
    el.play = true
    await el.updateComplete
    expect(light('#g').hidden).toBe(false)
    el.removeAttribute('enable-colors')
    await el.updateComplete
    expect(light('#c').hidden).toBe(true)
  })

  // Appended after connect, and again after a move: the two moments a framework
  // adds a control without any property of the board changing.
  test('a control added deep inside the bar after connect gets its state, and again after a move', async () => {
    await mount({ 'enable-colors': '' }, '<div slot="controls" id="bar"><div id="group"></div></div>')
    const late = document.createElement('button')
    late.setAttribute('data-board-action', 'colors')
    light('#group').append(late)
    await raf()
    expect(late.getAttribute('aria-pressed')).toBe('false')
    expect(late.hidden).toBe(false)

    el.remove()
    document.body.append(el)
    const moved = document.createElement('button')
    moved.setAttribute('data-board-action', 'gestures')
    light('#group').append(moved)
    await raf()
    expect(moved.hidden).toBe(true)
  })

  test('preventDefault on colored-change works the same from a host control', async () => {
    await mount({ 'enable-colors': '' }, '<button slot="colors" data-board-action="colors" id="c">C</button>')
    el.addEventListener('colored-change', (e) => e.preventDefault())
    light('#c').click()
    await el.updateComplete
    expect(el.colored).toBe(false)
    expect(light('#c').getAttribute('aria-pressed')).toBe('false')
    el.view = { colored: true }
    await el.updateComplete
    expect(el.colored).toBe(true)
    expect(light('#c').getAttribute('aria-pressed')).toBe('true')
  })

  test("a nested board's controls are not the outer board's", async () => {
    await mount(
      { 'enable-colors': '' },
      '<div slot="controls"><arrowz-board id="inner" enable-colors>' +
        '<button slot="colors" data-board-action="colors" id="ic">C</button></arrowz-board></div>',
    )
    const inner = el.querySelector('arrowz-board')
    if (!inner) throw new Error('no inner board')
    await inner.updateComplete
    el.toggleColors()
    await el.updateComplete
    expect(el.colored).toBe(true)
    expect(inner.colored).toBe(false)
    expect(light('#ic').getAttribute('aria-pressed')).toBe('false')
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project chromium src/controls.browser.test.ts`
Expected: all six FAIL — `getAttribute('aria-pressed')` is `null` where `'false'`/`'true'` is expected, and `hidden` is `false` where `true` is expected. "A nested board's controls…" fails on `toBe('false')` because nothing writes `aria-pressed` yet.

- [ ] **Step 3: Implement `syncActions` and its two triggers**

In `arrowz-board.ts`, after the field `private geometryKey = ''`, add:

```ts
  /** Brings host controls added after connect, at any depth, under `syncActions`. */
  private readonly actionObserver = new MutationObserver(() => this.syncActions())
```

In `connectedCallback`, after `this.observer.observe(this)`, add:

```ts
    // Not `aria-pressed` or `hidden`: those are what `syncActions` writes.
    this.actionObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-board-action', 'slot'],
    })
```

In `disconnectedCallback`, after `this.observer = null`, add:

```ts
    this.actionObserver.disconnect()
```

At the start of `updated()`, after the line `if (changed.has('chosenMode') || changed.has('play') || changed.has('interactive')) this.refreshCursor()`, add:

```ts
    if (
      changed.has('enableColors') || changed.has('coloredOverride') || changed.has('view') ||
      changed.has('chosenMode') || changed.has('play') || changed.has('interactive')
    ) this.syncActions()
```

After `act`, add:

```ts
  /**
   * `aria-pressed` and `hidden` on the host's colour and gesture controls, the
   * two attributes the element owns there. A control inside a nested board is
   * that board's.
   */
  private syncActions(): void {
    for (const node of this.querySelectorAll('[data-board-action="colors"], [data-board-action="gestures"]')) {
      if (node.closest('arrowz-board') !== this) continue
      const colors = node.getAttribute('data-board-action') === 'colors'
      node.setAttribute('aria-pressed', String(colors ? this.colored : this.chosenMode === 'click'))
      node.toggleAttribute('hidden', !(colors ? this.enableColors : this.playable))
    }
  }
```

- [ ] **Step 4: Run and see them pass**

Run: `npx vitest run --project chromium src/controls.browser.test.ts`
Expected: all pass.

- [ ] **Step 5: Mutations — each must turn the named test red, then revert**

1. Delete the `this.actionObserver.observe(…)` call → red: "a control added deep inside the bar after connect…" on the first `aria-pressed`. Control: "a host colour control is pressed…" stays green (its control exists before the first update).
2. Keep `observe` but move it from `connectedCallback` into the constructor → red: the same test on `moved.hidden` (the disconnect in `disconnectedCallback` is never undone).
3. Delete the `if (node.closest('arrowz-board') !== this) continue` line → red: "a nested board's controls are not the outer board's" on `toBe('false')`.
4. Drop `changed.has('view') ||` from the new `updated()` condition → red: "a host colour control is pressed…" on the `view.colored` half.

- [ ] **Step 6: Package gate**

Run: `pnpm nx run board-element:verify --skip-nx-cache`
Expected: success.

Run, from `packages/engine`: `deno test -A comments.test.ts`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/board-element/src/arrowz-board.ts packages/board-element/src/controls.browser.test.ts
git commit -m "Board element: host colour and gesture controls carry aria-pressed and hidden like the defaults"
```

---

### Task 4: README section and the full gates

**Files:**
- Modify: `packages/board-element/README.md` (new section before `### Playing the board`; one sentence in "Playing the board")

**Interfaces:**
- Consumes: the behaviour of Tasks 1–3 as specified.

- [ ] **Step 1: Write the section**

In `packages/board-element/README.md`, insert before the line `### Playing the board`:

````md
### Slots and custom controls

The hint and the buttons in the corner are slot fallback content: a host that
projects its own content into a slot replaces the default there, and a slot
left empty keeps it.

| Slot | Default | Present when |
|---|---|---|
| `controls` | the whole bar, holding the slots below | always |
| `hint` | the mode hint | `controls` is empty |
| `zoom-in` | `+` | `controls` is empty |
| `zoom-out` | `−` | `controls` is empty |
| `fit` | `⤢` | `controls` is empty |
| `colors` | `◑` | `controls` is empty and `enableColors` |
| `gestures` | `☝` | `controls` is empty and `interactive` or `play` |

```html
<arrowz-board play>
  <button slot="fit" data-board-action="fit" aria-label="Show everything">Fit</button>
</arrowz-board>
```

`data-board-action` names what a click on the element, or on anything inside
it, does: `zoom-in`, `zoom-out`, `fit`, `colors` (as `toggleColors()`) or
`gestures` (as `toggleGestures()`). It works in every slot, at any depth
inside a custom `controls`; any other value does nothing. The name is
namespaced because `data-action` belongs to common event delegators.

A custom `controls` replaces the bar and its position: the per-control slots
live inside the bar, so a `slot="fit"` child next to a custom bar is not
drawn. The host is `position: relative`, so a bar positioned `absolute` is
placed against the board.

The element keeps two attributes on the host's `colors` and `gestures`
controls in step with the board, and owns them there: `aria-pressed`, and
`hidden` while the action is unavailable (no `enableColors`; a board that is
neither `interactive` nor `play`). Under a coarse pointer the `hint` and
`gestures` slots are not drawn, projected content included; inside a custom
`controls` that rule is the host's.

The element gives projected controls no role and no name: project a
`<button>` with its own accessible name. A control that is not a button still
runs its action on click, and nothing more.
````

In `### Playing the board`, change `board grows a fourth chrome button` to `board grows a fourth chrome button (or shows the host's own, see [Slots and custom controls](#slots-and-custom-controls))`.

- [ ] **Step 2: Format and check the README**

Run, from `packages/board-element`: `deno fmt README.md`, then `deno fmt --check`.
Expected: no diff on the second run.

- [ ] **Step 3: Full gates**

Run, from `packages/engine`: `deno task verify`
Expected: check, lint, fmt, test pass.

Run, from the repository root: `pnpm nx run-many -t verify --skip-nx-cache`
Expected: every project succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/board-element/README.md
git commit -m "Board element README: slots and custom controls"
```
