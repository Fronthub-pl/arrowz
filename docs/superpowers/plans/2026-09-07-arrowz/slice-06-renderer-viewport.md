# Slice 6 — SVG renderer and viewport

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** See the board. Draw it in SVG according to visually verified
parameters, add zoom and panning, and **measure** whether SVG holds up at
~2,300 paths.

**Architecture:** `render/renderer.ts` defines the interface, `svgRenderer.ts`
implements it. The renderer sits behind the interface precisely so that
swapping in Canvas won't touch the core — this is the project's only open
performance risk. `viewport.ts` is **pure math** with no DOM: it converts
screen coordinates to cells and maintains the `viewBox`. In SVG, zoom and
panning are a change to a single attribute, with no path redrawing.

**Coordinate system:** the SVG world is scaled in **cells**, not pixels. The
center of cell `(x, y)` sits at point `(x + 0.5, y + 0.5)`. This means a line
thickness of `0.5` literally means "half a grid unit," and zoom reduces to the
`viewBox`.

**Stack:** TypeScript strict, SVG, Vitest (core in Node, renderer in jsdom).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§11)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- **Monochromaticity is a gameplay requirement**, not a cost-saving measure:
  the player must distinguish pieces without the help of color, and that is
  the source of the perceptual difficulty (§9). Per-piece coloring exists
  only as a diagnostic mode.
- Drawing parameters: `<polyline>` through cell centers, thickness `0.5` of
  a grid unit, `stroke-linecap`/`stroke-linejoin` = `round`, arrowhead as
  a filled triangle ~`0.6` of a grid unit, colors `#232447` on `#f6f6fa`.
- Scale range: from fitting the whole board to the screen (lower bound) up
  to a cell of ~48 px (upper bound).
- Scaling **always preserves the point under the cursor** or under the
  center of the gesture.

## File Structure

| File | Responsibility |
|---|---|
| `src/render/viewport.ts` | pure viewport math: scale, offset, screen ↔ cell |
| `src/render/renderer.ts` | renderer interface and drawing parameters |
| `src/render/svgRenderer.ts` | SVG implementation, piece hit-testing, animations |
| `src/render/viewport.spec.ts` | viewport math tests (Node) |
| `src/render/svgRenderer.spec.ts` | drawing and hit-testing tests (jsdom) |
| `tools/render-preview.ts` | SVG preview for visual review and measurement |

---

### Task 1: Viewport math

**Files:**
- Create: `src/render/viewport.ts`
- Test: `src/render/viewport.spec.ts`
- Modify: `vitest.core.config.ts` (add `src/render/viewport.spec.ts`)

**Interfaces:**
- Produces:
  - `interface ViewportConfig { boardWidth: number; boardHeight: number; screenWidth: number; screenHeight: number }`
  - `interface Viewport extends ViewportConfig { cellPx: number; originX: number; originY: number }`
  - `createViewport(config: ViewportConfig): Viewport` — starts fitted
  - `fit(vp: Viewport): Viewport`
  - `zoomAt(vp: Viewport, factor: number, screenX: number, screenY: number): Viewport`
  - `panBy(vp: Viewport, dxPx: number, dyPx: number): Viewport`
  - `screenToCell(vp: Viewport, screenX: number, screenY: number): Coord | null`
  - `viewBox(vp: Viewport): string`
  - `MAX_CELL_PX = 48`

`viewport.ts` doesn't touch the DOM, so we test it in Node alongside the
core — faster and without jsdom.

- [ ] **Step 1: Add the viewport to the core test runner**

In `vitest.core.config.ts`, extend `include`:

```typescript
    include: [
      'src/core/**/*.spec.ts',
      'src/game/**/*.spec.ts',
      'src/render/viewport.spec.ts', // pure math, no DOM
    ],
```

- [ ] **Step 2: Write failing tests**

```typescript
// src/render/viewport.spec.ts
import {
  createViewport, fit, MAX_CELL_PX, panBy, screenToCell, viewBox, zoomAt,
} from './viewport';

const config = { boardWidth: 100, boardHeight: 200, screenWidth: 400, screenHeight: 800 };

describe('createViewport', () => {
  it('starts with the board fitted to the screen', () => {
    const vp = createViewport(config);
    expect(vp.cellPx).toBeCloseTo(4, 6); // 400/100 = 4, 800/200 = 4
    expect(vp.originX).toBeCloseTo(0, 6);
    expect(vp.originY).toBeCloseTo(0, 6);
  });

  it('centers the board on the axis where slack remains', () => {
    const vp = createViewport({ ...config, screenWidth: 800 });
    // The scale is still bounded by the height (800/200 = 4), so the board
    // occupies 400 of 800 px of width and must be centered.
    expect(vp.cellPx).toBeCloseTo(4, 6);
    expect(vp.originX).toBeCloseTo(-50, 6); // 400 px slack = 100 cells / 2
  });
});

describe('zoomAt', () => {
  it('preserves the point under the cursor', () => {
    const vp = createViewport(config);
    const before = screenToCell(vp, 120, 300)!;
    const zoomed = zoomAt(vp, 2, 120, 300);
    const after = screenToCell(zoomed, 120, 300)!;
    expect(after).toEqual(before);
  });

  it('does not allow zooming out below the fit level', () => {
    const vp = createViewport(config);
    const zoomedOut = zoomAt(vp, 0.1, 200, 400);
    expect(zoomedOut.cellPx).toBeCloseTo(vp.cellPx, 6);
  });

  it('does not allow zooming in beyond the readability limit', () => {
    let vp = createViewport(config);
    for (let i = 0; i < 20; i++) vp = zoomAt(vp, 2, 200, 400);
    expect(vp.cellPx).toBeCloseTo(MAX_CELL_PX, 6);
  });

  it('does not let the board escape the view', () => {
    let vp = createViewport(config);
    vp = zoomAt(vp, 4, 0, 0);
    expect(vp.originX).toBeGreaterThanOrEqual(0);
    expect(vp.originY).toBeGreaterThanOrEqual(0);
    const viewCellsX = vp.screenWidth / vp.cellPx;
    expect(vp.originX + viewCellsX).toBeLessThanOrEqual(config.boardWidth + 1e-6);
  });
});

describe('panBy', () => {
  it('shifts the view by the given number of pixels', () => {
    const vp = zoomAt(createViewport(config), 4, 200, 400);
    const moved = panBy(vp, -40, 0);
    expect(moved.originX).toBeCloseTo(vp.originX + 40 / vp.cellPx, 6);
  });

  it('does not let the board escape the view', () => {
    const vp = zoomAt(createViewport(config), 4, 200, 400);
    const far = panBy(vp, -100_000, -100_000);
    const viewCellsX = far.screenWidth / far.cellPx;
    const viewCellsY = far.screenHeight / far.cellPx;
    expect(far.originX + viewCellsX).toBeLessThanOrEqual(config.boardWidth + 1e-6);
    expect(far.originY + viewCellsY).toBeLessThanOrEqual(config.boardHeight + 1e-6);
  });

  it('does nothing when the board is fully visible', () => {
    const vp = createViewport(config);
    expect(panBy(vp, 200, 200).originX).toBeCloseTo(vp.originX, 6);
  });
});

describe('screenToCell', () => {
  it('maps a pixel to a cell', () => {
    const vp = createViewport(config);
    expect(screenToCell(vp, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(screenToCell(vp, 4.5, 4.5)).toEqual({ x: 1, y: 1 });
    expect(screenToCell(vp, 399, 799)).toEqual({ x: 99, y: 199 });
  });

  it('returns null outside the board', () => {
    const vp = createViewport({ ...config, screenWidth: 800 });
    expect(screenToCell(vp, 10, 10)).toBeNull(); // left margin after centering
    expect(screenToCell(vp, 790, 10)).toBeNull();
  });

  it('works after zooming in', () => {
    const vp = zoomAt(createViewport(config), 4, 200, 400);
    const cell = screenToCell(vp, 200, 400)!;
    expect(cell.x).toBeGreaterThanOrEqual(0);
    expect(cell.x).toBeLessThan(100);
  });
});

describe('fit', () => {
  it('returns to the fitted state after zooming in', () => {
    const vp = createViewport(config);
    const zoomed = zoomAt(vp, 6, 100, 100);
    const back = fit(zoomed);
    expect(back.cellPx).toBeCloseTo(vp.cellPx, 6);
    expect(back.originX).toBeCloseTo(vp.originX, 6);
    expect(back.originY).toBeCloseTo(vp.originY, 6);
  });
});

describe('viewBox', () => {
  it('describes the view in cell units', () => {
    const vp = createViewport(config);
    expect(viewBox(vp)).toBe('0 0 100 200');
  });

  it('changes when zooming in', () => {
    const vp = zoomAt(createViewport(config), 2, 0, 0);
    const [, , w, h] = viewBox(vp).split(' ').map(Number);
    expect(w).toBeCloseTo(50, 6);
    expect(h).toBeCloseTo(100, 6);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

```bash
npm run test:core -- viewport
```

Expected: FAIL — module `./viewport` is missing.

- [ ] **Step 4: Implement the viewport**

```typescript
// src/render/viewport.ts
import { Coord } from '../core/types';

/** Upper zoom limit: above ~48 px per cell, orientation breaks down. */
export const MAX_CELL_PX = 48;

export interface ViewportConfig {
  boardWidth: number;
  boardHeight: number;
  screenWidth: number;
  screenHeight: number;
}

export interface Viewport extends ViewportConfig {
  /** How many screen pixels correspond to one cell. */
  cellPx: number;
  /** Top-left corner of the view, in cell units. */
  originX: number;
  originY: number;
}

function fitScale(c: ViewportConfig): number {
  return Math.min(c.screenWidth / c.boardWidth, c.screenHeight / c.boardHeight);
}

/**
 * Clamps the offset so the view doesn't drift off the board.
 * When the board fits entirely within an axis, we center it, since there's
 * nothing to see beyond the board.
 */
function clampOrigin(vp: Viewport): Viewport {
  const viewCellsX = vp.screenWidth / vp.cellPx;
  const viewCellsY = vp.screenHeight / vp.cellPx;

  const originX = viewCellsX >= vp.boardWidth
    ? (vp.boardWidth - viewCellsX) / 2
    : Math.min(Math.max(vp.originX, 0), vp.boardWidth - viewCellsX);

  const originY = viewCellsY >= vp.boardHeight
    ? (vp.boardHeight - viewCellsY) / 2
    : Math.min(Math.max(vp.originY, 0), vp.boardHeight - viewCellsY);

  return { ...vp, originX, originY };
}

export function createViewport(config: ViewportConfig): Viewport {
  return clampOrigin({ ...config, cellPx: fitScale(config), originX: 0, originY: 0 });
}

export function fit(vp: Viewport): Viewport {
  return createViewport({
    boardWidth: vp.boardWidth,
    boardHeight: vp.boardHeight,
    screenWidth: vp.screenWidth,
    screenHeight: vp.screenHeight,
  });
}

/**
 * Zoom that preserves the point under the cursor.
 *
 * Without this, zooming in on a 100×200 board amounts to guessing where
 * you'll end up.
 */
export function zoomAt(vp: Viewport, factor: number, screenX: number, screenY: number): Viewport {
  const minPx = fitScale(vp);
  const cellPx = Math.min(MAX_CELL_PX, Math.max(minPx, vp.cellPx * factor));
  if (cellPx === vp.cellPx) return vp;

  // The cell under the cursor before scaling must stay under it afterward.
  const worldX = vp.originX + screenX / vp.cellPx;
  const worldY = vp.originY + screenY / vp.cellPx;
  return clampOrigin({
    ...vp,
    cellPx,
    originX: worldX - screenX / cellPx,
    originY: worldY - screenY / cellPx,
  });
}

export function panBy(vp: Viewport, dxPx: number, dyPx: number): Viewport {
  return clampOrigin({
    ...vp,
    originX: vp.originX - dxPx / vp.cellPx,
    originY: vp.originY - dyPx / vp.cellPx,
  });
}

/** Cell under a screen point, or null if the point lies outside the board. */
export function screenToCell(vp: Viewport, screenX: number, screenY: number): Coord | null {
  const x = Math.floor(vp.originX + screenX / vp.cellPx);
  const y = Math.floor(vp.originY + screenY / vp.cellPx);
  if (x < 0 || y < 0 || x >= vp.boardWidth || y >= vp.boardHeight) return null;
  return { x, y };
}

/** The `viewBox` attribute in cell units — the only thing zoom changes. */
export function viewBox(vp: Viewport): string {
  const w = vp.screenWidth / vp.cellPx;
  const h = vp.screenHeight / vp.cellPx;
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return `${round(vp.originX)} ${round(vp.originY)} ${round(w)} ${round(h)}`;
}

/** Zoom step for the + / − buttons and keys. */
export const ZOOM_STEP = 1.4;
```

- [ ] **Step 5: Run tests — should pass**

```bash
npm run test:core -- viewport
```

Expected: PASS (14 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add viewport math with zoom and panning"
```

---

### Task 2: Renderer interface and SVG implementation

**Files:**
- Create: `src/render/renderer.ts`
- Create: `src/render/svgRenderer.ts`
- Test: `src/render/svgRenderer.spec.ts`
- Modify: `angular.json` (application test scope)

**Interfaces:**
- Consumes: `Board`, `Piece`, `pieceAt` from the core; `Viewport` from Task 1.
- Produces:
  - `interface Renderer { draw(board: Board): void; setViewport(vp: Viewport): void; animateExit(pieceId: number, dir: Dir): Promise<void>; animateBounce(pieceId: number, dir: Dir, distance: number): Promise<void>; onPieceClick(cb: (pieceId: number) => void): void; destroy(): void }`
  - `interface DrawStyle { strokeRatio: number; ink: string; paper: string; colored: boolean }`
  - `DEFAULT_STYLE: DrawStyle`
  - `createSvgRenderer(host: SVGSVGElement, style?: Partial<DrawStyle>): Renderer`
  - `pieceGeometry(piece: Piece): { points: string; head: string }` — a pure
    function, testable without the DOM

- [ ] **Step 1: Set the application test scope**

Without this, `ng test` would run the core tests a second time, in jsdom.
In `angular.json`, under `architect.test.options`:

```json
{
  "include": [
    "src/app/**/*.spec.ts",
    "src/ui/**/*.spec.ts",
    "src/render/svgRenderer.spec.ts"
  ]
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// src/render/svgRenderer.spec.ts
import { withMetrics } from '../core/metrics';
import { boardOf, piece } from '../core/testing/fixtures';
import { createViewport } from './viewport';
import { createSvgRenderer, pieceGeometry } from './svgRenderer';
import { DEFAULT_STYLE } from './renderer';

function host(): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.append(el);
  return el;
}

const board = withMetrics(
  boardOf(4, 4, [
    piece(0, 0, [[0, 0], [0, 1], [1, 1]]),
    piece(1, 1, [[3, 0], [2, 0], [1, 0]]),
    piece(2, 2, [[0, 2], [0, 3]]),
    piece(3, 2, [[1, 2], [1, 3]]),
    piece(4, 2, [[2, 2], [2, 3]]),
    piece(5, 2, [[3, 2], [3, 3]]),
    piece(6, 3, [[2, 1], [3, 1]]),
  ]),
);

describe('pieceGeometry', () => {
  it('draws a line through cell centers', () => {
    const g = pieceGeometry(piece(0, 1, [[2, 0], [1, 0], [0, 0]]));
    expect(g.points).toBe('2.5,0.5 1.5,0.5 0.5,0.5');
  });

  it('draws the arrowhead ahead of the head cell, following direction', () => {
    const right = pieceGeometry(piece(0, 1, [[2, 0], [1, 0]]));
    const left = pieceGeometry(piece(0, 3, [[0, 0], [1, 0]]));
    expect(right.head).not.toBe(left.head);
    // The arrowhead tip lies further right than the head cell's center.
    const firstX = Number(right.head.split(' ')[0]!.split(',')[0]);
    expect(firstX).toBeGreaterThan(2.5);
  });
});

describe('createSvgRenderer', () => {
  it('draws one polyline per piece', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    expect(svg.querySelectorAll('polyline').length).toBe(board.pieces.size);
    expect(svg.querySelectorAll('polygon').length).toBe(board.pieces.size);
    r.destroy();
  });

  it('applies the drawing parameters from the spec', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    const group = svg.querySelector('g[data-role="pieces"]')!;
    expect(group.getAttribute('stroke-width')).toBe(String(DEFAULT_STYLE.strokeRatio));
    expect(group.getAttribute('stroke-linecap')).toBe('round');
    expect(group.getAttribute('stroke-linejoin')).toBe('round');
    expect(svg.querySelector('polyline')!.getAttribute('stroke')).toBe(DEFAULT_STYLE.ink);
    r.destroy();
  });

  it('is monochromatic by default', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    const colors = new Set(
      [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke')),
    );
    expect(colors.size).toBe(1);
    r.destroy();
  });

  it('colors pieces only in diagnostic mode', () => {
    const svg = host();
    const r = createSvgRenderer(svg, { colored: true });
    r.draw(board);
    const colors = new Set(
      [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke')),
    );
    expect(colors.size).toBeGreaterThan(1);
    r.destroy();
  });

  it('sets the viewBox from the viewport', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.setViewport(createViewport({ boardWidth: 4, boardHeight: 4, screenWidth: 400, screenHeight: 400 }));
    r.draw(board);
    expect(svg.getAttribute('viewBox')).toBe('0 0 4 4');
    r.destroy();
  });

  it('translates a click into a piece id', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.setViewport(createViewport({ boardWidth: 4, boardHeight: 4, screenWidth: 400, screenHeight: 400 }));
    r.draw(board);
    const seen: number[] = [];
    r.onPieceClick((id) => seen.push(id));

    // Hit-testing is done via coordinates, not via the event target: this
    // way a click in the gap between lines still hits the owning cell.
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true }));
    expect(seen).toEqual([0]);
    r.destroy();
  });

  it('does not report a click when the pointer moved to another piece', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.setViewport(createViewport({ boardWidth: 4, boardHeight: 4, screenWidth: 400, screenHeight: 400 }));
    r.draw(board);
    const seen: number[] = [];
    r.onPieceClick((id) => seen.push(id));
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 350, clientY: 350, bubbles: true }));
    expect(seen).toEqual([]);
    r.destroy();
  });

  it('does not report a click while a modifier key is held', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.setViewport(createViewport({ boardWidth: 4, boardHeight: 4, screenWidth: 400, screenHeight: 400 }));
    r.draw(board);
    const seen: number[] = [];
    r.onPieceClick((id) => seen.push(id));
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, metaKey: true, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 10, metaKey: true, bubbles: true }));
    expect(seen).toEqual([]);
    r.destroy();
  });

  it('removes the piece from the DOM after the exit animation', async () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    await r.animateExit(0, 0);
    expect(svg.querySelector('[data-piece="0"]')).toBeNull();
    r.destroy();
  });

  it('leaves the piece in place after a bounce', async () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    await r.animateBounce(2, 2, 1);
    expect(svg.querySelector('[data-piece="2"]')).not.toBeNull();
    r.destroy();
  });

  it('cleans up after itself', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    r.destroy();
    expect(svg.children.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — modules `./renderer` and `./svgRenderer` are missing.

- [ ] **Step 4: Define the renderer interface**

```typescript
// src/render/renderer.ts
import { Board, Dir } from '../core/types';
import { Viewport } from './viewport';

/**
 * Drawing parameters verified visually on the prototype (§11).
 * Values are in grid-unit terms, not pixels — the SVG world is scaled
 * in cells.
 */
export interface DrawStyle {
  /** Line thickness as a fraction of the grid unit. The configurator allows 0.35–0.65. */
  strokeRatio: number;
  ink: string;
  paper: string;
  /** Per-piece color. DIAGNOSTIC MODE — never in actual gameplay. */
  colored: boolean;
}

export const DEFAULT_STYLE: DrawStyle = {
  strokeRatio: 0.5,
  ink: '#232447',
  paper: '#f6f6fa',
  colored: false,
};

/**
 * The renderer sits behind the interface so that a future swap from SVG to
 * Canvas won't touch the core. This is the project's only open performance
 * risk (§11).
 */
export interface Renderer {
  draw(board: Board): void;
  setViewport(viewport: Viewport): void;
  /** The piece exits the board along the head's trail. */
  animateExit(pieceId: number, dir: Dir): Promise<void>;
  /** The piece moves out until it touches a blocker and returns — shows where the blocker is. */
  animateBounce(pieceId: number, dir: Dir, distance: number): Promise<void>;
  onPieceClick(callback: (pieceId: number) => void): void;
  destroy(): void;
}
```

- [ ] **Step 5: Implement the SVG renderer**

```typescript
// src/render/svgRenderer.ts
import { pieceAt } from '../core/board';
import { Board, Dir, DIR_VECTORS, EMPTY, Piece } from '../core/types';
import { DEFAULT_STYLE, DrawStyle, Renderer } from './renderer';
import { createViewport, screenToCell, Viewport } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EXIT_MS = 260;
const BOUNCE_MS = 320;

/** Piece geometry in cell units. A pure function — testable without the DOM. */
export function pieceGeometry(piece: Piece): { points: string; head: string } {
  const points = piece.cells.map((c) => `${c.x + 0.5},${c.y + 0.5}`).join(' ');

  const v = DIR_VECTORS[piece.dir]!;
  const head = piece.cells[0]!;
  const hx = head.x + 0.5;
  const hy = head.y + 0.5;
  const tip = 0.62;
  const len = 0.62;
  const half = 0.42;
  const tx = hx + v.x * tip;
  const ty = hy + v.y * tip;
  const bx = tx - v.x * len;
  const by = ty - v.y * len;

  const arrow = [
    `${tx},${ty}`,
    `${bx - v.y * half},${by + v.x * half}`,
    `${bx + v.y * half},${by - v.x * half}`,
  ].join(' ');

  return { points, head: arrow };
}

export function createSvgRenderer(
  host: SVGSVGElement,
  style: Partial<DrawStyle> = {},
): Renderer {
  const drawStyle: DrawStyle = { ...DEFAULT_STYLE, ...style };
  let board: Board | null = null;
  let viewport: Viewport | null = null;
  let clickCallback: ((pieceId: number) => void) | null = null;
  let pressedPiece: number | null = null;

  host.style.background = drawStyle.paper;
  host.style.touchAction = 'none';

  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset['role'] = 'pieces';
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke-width', String(drawStyle.strokeRatio));
  group.setAttribute('stroke-linecap', 'round');
  group.setAttribute('stroke-linejoin', 'round');

  const headsGroup = document.createElementNS(SVG_NS, 'g');
  headsGroup.dataset['role'] = 'heads';

  host.append(group, headsGroup);

  /**
   * Hit-testing is done via COORDINATES, not via `event.target`.
   * A click in the gap between two lines of the same piece must also hit
   * its owner — the pixel → cell → occupancy → id mapping is shared by
   * mouse and touch (§11).
   */
  function pieceUnderPointer(event: MouseEvent | PointerEvent): number | null {
    if (!board || !viewport) return null;
    const rect = host.getBoundingClientRect();
    const cell = screenToCell(viewport, event.clientX - rect.left, event.clientY - rect.top);
    if (!cell) return null;
    const id = pieceAt(board, cell.x, cell.y);
    return id === EMPTY ? null : id;
  }

  function onPointerDown(event: PointerEvent | MouseEvent): void {
    // Dragging the board requires a modifier key, so with a modifier held
    // we do NOT start a game move — a mistake here costs a life (§11).
    if (event.metaKey || event.ctrlKey) {
      pressedPiece = null;
      return;
    }
    pressedPiece = pieceUnderPointer(event);
  }

  function onPointerUp(event: PointerEvent | MouseEvent): void {
    const released = pieceUnderPointer(event);
    const pressed = pressedPiece;
    pressedPiece = null;
    if (event.metaKey || event.ctrlKey) return;
    // Standard button semantics: the move only fires on release, and only
    // over the same piece the press started on.
    if (pressed !== null && pressed === released) clickCallback?.(pressed);
  }

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointerup', onPointerUp);

  function elementsOf(pieceId: number): SVGElement[] {
    return [...host.querySelectorAll<SVGElement>(`[data-piece="${pieceId}"]`)];
  }

  async function slide(pieceId: number, dir: Dir, cells: number, ms: number, back: boolean) {
    const v = DIR_VECTORS[dir]!;
    const parts = elementsOf(pieceId);
    if (parts.length === 0) return;

    const keyframes = back
      ? [
          { transform: 'translate(0,0)' },
          { transform: `translate(${v.x * cells}px, ${v.y * cells}px)` },
          { transform: 'translate(0,0)' },
        ]
      : [
          { transform: 'translate(0,0)' },
          { transform: `translate(${v.x * cells}px, ${v.y * cells}px)` },
        ];

    // In jsdom `animate` doesn't exist — in that case we skip the animation
    // and apply its effect immediately. The test checks the effect, not the motion.
    const animations = parts
      .filter((el) => typeof el.animate === 'function')
      .map((el) => el.animate(keyframes, { duration: ms, easing: 'ease-in', fill: 'none' }));

    await Promise.all(animations.map((a) => a.finished.catch(() => undefined)));
  }

  return {
    draw(next: Board): void {
      board = next;
      if (!viewport) {
        viewport = createViewport({
          boardWidth: next.width,
          boardHeight: next.height,
          screenWidth: host.clientWidth || next.width,
          screenHeight: host.clientHeight || next.height,
        });
      }
      host.setAttribute('viewBox', `${viewport.originX} ${viewport.originY} ` +
        `${viewport.screenWidth / viewport.cellPx} ${viewport.screenHeight / viewport.cellPx}`);

      group.replaceChildren();
      headsGroup.replaceChildren();

      for (const piece of next.pieces.values()) {
        const { points, head } = pieceGeometry(piece);
        const colour = drawStyle.colored
          ? `hsl(${(piece.id * 137.508) % 360} 62% 42%)`
          : drawStyle.ink;

        const line = document.createElementNS(SVG_NS, 'polyline');
        line.setAttribute('points', points);
        line.setAttribute('stroke', colour);
        line.dataset['piece'] = String(piece.id);
        group.append(line);

        const arrow = document.createElementNS(SVG_NS, 'polygon');
        arrow.setAttribute('points', head);
        arrow.setAttribute('fill', colour);
        arrow.dataset['piece'] = String(piece.id);
        headsGroup.append(arrow);
      }
    },

    setViewport(next: Viewport): void {
      viewport = next;
      const w = next.screenWidth / next.cellPx;
      const h = next.screenHeight / next.cellPx;
      // Zoom and panning are ONE attribute change — no path redrawing.
      // This is the main reason SVG holds up despite the scale (§11).
      host.setAttribute('viewBox', `${next.originX} ${next.originY} ${w} ${h}`);
    },

    async animateExit(pieceId: number, dir: Dir): Promise<void> {
      const piece = board?.pieces.get(pieceId);
      const distance = piece ? piece.cells.length + 2 : 4;
      await slide(pieceId, dir, distance, EXIT_MS, false);
      for (const el of elementsOf(pieceId)) el.remove();
    },

    async animateBounce(pieceId: number, dir: Dir, distance: number): Promise<void> {
      await slide(pieceId, dir, distance, BOUNCE_MS, true);
    },

    onPieceClick(callback: (pieceId: number) => void): void {
      clickCallback = callback;
    },

    destroy(): void {
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointerup', onPointerUp);
      host.replaceChildren();
      clickCallback = null;
      board = null;
    },
  };
}
```

- [ ] **Step 6: Run tests — should pass**

```bash
npx ng test --watch=false
```

Expected: PASS. If the click test fails, check whether jsdom returns
a sensible `getBoundingClientRect` — if needed, set in the test
`host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 } as DOMRect)`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add SVG board renderer"
```

---

### Task 3: Preview and performance budget

**Files:**
- Create: `tools/render-preview.ts`
- Create: `docs/benchmarks/2026-09-07-render.md` (measurement result)
- Modify: `package.json` (`preview` script)

**Interfaces:**
- Produces: SVG files for visual review plus a drawing-time measurement.

This is the point at which **calibrating the look becomes possible**. The
prototype hit a wall with the ASCII preview, which cannot represent a path
touching itself — and at 35% coiling that's one cell in three.

- [ ] **Step 1: Write the preview generator**

```typescript
// tools/render-preview.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { createLevel } from '../src/core/level';
import { BoardFormat, LevelId } from '../src/core/presets';
import { DEFAULT_STYLE } from '../src/render/renderer';
import { pieceGeometry } from '../src/render/svgRenderer';
import { Board } from '../src/core/types';

/** The same geometry code as the renderer — the preview must not drift from it. */
function toSvg(board: Board, cellPx: number, colored: boolean, strokeRatio: number): string {
  const w = board.width * cellPx;
  const h = board.height * cellPx;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
      `viewBox="0 0 ${board.width} ${board.height}">`,
    `<rect width="${board.width}" height="${board.height}" fill="${DEFAULT_STYLE.paper}"/>`,
    `<g fill="none" stroke-width="${strokeRatio}" stroke-linecap="round" stroke-linejoin="round">`,
  ];
  const heads: string[] = [];
  for (const piece of board.pieces.values()) {
    const colour = colored ? `hsl(${(piece.id * 137.508) % 360} 62% 42%)` : DEFAULT_STYLE.ink;
    const g = pieceGeometry(piece);
    parts.push(`<polyline points="${g.points}" stroke="${colour}"/>`);
    heads.push(`<polygon points="${g.head}" fill="${colour}"/>`);
  }
  parts.push('</g>', `<g>${heads.join('')}</g>`, '</svg>');
  return parts.join('\n');
}

const arg = (key: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${key}=`))?.split('=')[1] ?? fallback;

const level = arg('level', 'easy') as LevelId;
const format = arg('format', 'tall') as BoardFormat;
const seed = Number(arg('seed', '7'));
const cellPx = Number(arg('cell', '14'));
const strokeRatio = Number(arg('stroke', String(DEFAULT_STYLE.strokeRatio)));
const outDir = arg('out', 'preview');

mkdirSync(outDir, { recursive: true });

const t0 = performance.now();
const { board, report } = createLevel(level, format, seed);
const genMs = performance.now() - t0;

const t1 = performance.now();
const mono = toSvg(board, cellPx, false, strokeRatio);
const svgMs = performance.now() - t1;

writeFileSync(`${outDir}/${level}-${format}.svg`, mono);
writeFileSync(`${outDir}/${level}-${format}-diag.svg`, toSvg(board, cellPx, true, strokeRatio));

console.log(
  `${level}/${format} ${board.width}×${board.height}\n` +
    `  pieces ${board.pieces.size}, mean len ${report.meanLength.toFixed(1)}, ` +
    `max ${report.maxLength}\n` +
    `  f0 ${board.metrics.f0.toFixed(3)}, almost1 ` +
    `${((100 * board.metrics.almost1) / board.metrics.n).toFixed(0)}%, D ${board.metrics.d}\n` +
    `  generation ${genMs.toFixed(0)} ms, SVG serialization ${svgMs.toFixed(0)} ms\n` +
    `  saved to ${outDir}/`,
);
```

Add a script in `package.json`:

```json
{
  "preview": "tsx tools/render-preview.ts"
}
```

- [ ] **Step 2: Look at the board and calibrate the appearance**

```bash
npm run preview -- --level=easy --format=tall --cell=14
open preview/easy-tall.svg
```

Compare against the reference described in §11: **densely scattered
arrowheads plus a handful of very long lines**. If the board looks stretched
out, the long-piece basket's weight is too high; if it's all hook-shaped
mincemeat, it's too low.

Also check the diagnostic variant (`-diag.svg`), where each piece has
a different color — it's used to verify that pieces really are as tangled as
the monochrome version suggests.

- [ ] **Step 3: Measure the performance budget**

```bash
npm run preview -- --level=nightmare --format=tall --cell=6
```

Note the piece count and the time. This is **the project's only open
performance question** (§11): whether SVG can hold up at ~2,300 paths.

Then check this in the browser, since string serialization isn't the same
as laying out the DOM:

```bash
npx ng serve
```

After completing Slice 7, come back here and measure three things in
DevTools, recording the result in `docs/benchmarks/2026-09-07-render.md`:

1. time from `draw()` to the first frame for Nightmare 100×200,
2. smoothness during continuous scrolling (zoom + pan) — frames per second,
3. tab memory usage.

**Decision threshold:** if the first frame exceeds 1 s or zoom drops below
30 fps, we swap `svgRenderer` for a Canvas implementation. The core won't
notice — the renderer sits behind the interface for exactly this situation.

- [ ] **Step 4: Add `preview/` to `.gitignore`**

```bash
printf '\n# renderer previews\npreview/\n' >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add renderer preview and performance measurement"
```

---

## Slice Acceptance Criteria

- `npm run test:core` and `npx ng test` pass.
- Zoom preserves the point under the cursor (tested), doesn't go below the
  fit level, and doesn't exceed 48 px per cell.
- Panning doesn't let the board escape the view.
- The renderer draws one polyline and one arrowhead per piece, monochromatically.
- A click maps via coordinates to `occupancy`, requires release over the
  same piece, and is blocked by the ⌘/Ctrl modifier.
- `npm run preview` produces SVG that can be compared against the reference.
- The Nightmare performance measurement is recorded in `docs/benchmarks/`.
