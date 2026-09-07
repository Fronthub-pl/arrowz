# Slice 6 — Renderer SVG i widok

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Zobaczyć planszę. Narysować ją w SVG zgodnie z parametrami
zweryfikowanymi wzrokowo, dodać zoom i przesuwanie, i **zmierzyć**, czy SVG
wyrabia przy ~2 300 ścieżkach.

**Architektura:** `render/renderer.ts` definiuje interfejs, `svgRenderer.ts` go
implementuje. Renderer stoi za interfejsem dokładnie po to, żeby wymiana na
Canvas nie dotykała rdzenia — to jedyne otwarte ryzyko wydajnościowe projektu.
`viewport.ts` to **czysta matematyka** bez DOM: przelicza ekran na komórki
i utrzymuje `viewBox`. W SVG zoom i przesuwanie to zmiana jednego atrybutu,
bez przerysowywania ścieżek.

**Układ współrzędnych:** świat SVG jest wyskalowany w **komórkach**, nie
w pikselach. Środek komórki `(x, y)` leży w punkcie `(x + 0.5, y + 0.5)`.
Dzięki temu grubość linii `0.5` znaczy dosłownie „połowa podziałki", a zoom
sprowadza się do `viewBox`.

**Stack:** TypeScript strict, SVG, Vitest (rdzeń w Node, renderer w jsdom).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§11)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Monochromatyczność jest wymogiem rozgrywki**, nie oszczędnością: gracz musi
  odróżniać elementy bez pomocy koloru i to jest źródło trudności percepcyjnej
  (§9). Kolorowanie per element istnieje wyłącznie jako tryb diagnostyczny.
- Parametry rysowania: `<polyline>` przez środki komórek, grubość `0.5`
  podziałki, `stroke-linecap`/`stroke-linejoin` = `round`, grot jako wypełniony
  trójkąt ~`0.6` podziałki, kolory `#232447` na `#f6f6fa`.
- Zakres skali: od dopasowania całości do ekranu (dolna granica) po komórkę
  ~48 px (górna).
- Skalowanie **zawsze zachowuje punkt pod kursorem** lub pod środkiem gestu.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/render/viewport.ts` | czysta matematyka widoku: skala, przesunięcie, ekran ↔ komórka |
| `src/render/renderer.ts` | interfejs renderera i parametry rysowania |
| `src/render/svgRenderer.ts` | implementacja SVG, trafienie w element, animacje |
| `src/render/viewport.spec.ts` | testy matematyki widoku (Node) |
| `src/render/svgRenderer.spec.ts` | testy rysowania i trafień (jsdom) |
| `tools/render-preview.ts` | podgląd SVG do oceny wzrokowej i pomiaru |

---

### Task 1: Matematyka widoku

**Files:**
- Create: `src/render/viewport.ts`
- Test: `src/render/viewport.spec.ts`
- Modify: `vitest.core.config.ts` (dołączenie `src/render/viewport.spec.ts`)

**Interfaces:**
- Produces:
  - `interface ViewportConfig { boardWidth: number; boardHeight: number; screenWidth: number; screenHeight: number }`
  - `interface Viewport extends ViewportConfig { cellPx: number; originX: number; originY: number }`
  - `createViewport(config: ViewportConfig): Viewport` — startuje dopasowany
  - `fit(vp: Viewport): Viewport`
  - `zoomAt(vp: Viewport, factor: number, screenX: number, screenY: number): Viewport`
  - `panBy(vp: Viewport, dxPx: number, dyPx: number): Viewport`
  - `screenToCell(vp: Viewport, screenX: number, screenY: number): Coord | null`
  - `viewBox(vp: Viewport): string`
  - `MAX_CELL_PX = 48`

`viewport.ts` nie dotyka DOM, więc testujemy go w Node razem z rdzeniem —
szybciej i bez jsdom.

- [ ] **Krok 1: Dołącz widok do runnera rdzenia**

W `vitest.core.config.ts` rozszerz `include`:

```typescript
    include: [
      'src/core/**/*.spec.ts',
      'src/game/**/*.spec.ts',
      'src/render/viewport.spec.ts', // czysta matematyka, bez DOM
    ],
```

- [ ] **Krok 2: Napisz failujące testy**

```typescript
// src/render/viewport.spec.ts
import {
  createViewport, fit, MAX_CELL_PX, panBy, screenToCell, viewBox, zoomAt,
} from './viewport';

const config = { boardWidth: 100, boardHeight: 200, screenWidth: 400, screenHeight: 800 };

describe('createViewport', () => {
  it('startuje z planszą dopasowaną do ekranu', () => {
    const vp = createViewport(config);
    expect(vp.cellPx).toBeCloseTo(4, 6); // 400/100 = 4, 800/200 = 4
    expect(vp.originX).toBeCloseTo(0, 6);
    expect(vp.originY).toBeCloseTo(0, 6);
  });

  it('centruje planszę w osi, w której zostaje zapas', () => {
    const vp = createViewport({ ...config, screenWidth: 800 });
    // Skala nadal ograniczona wysokością (800/200 = 4), więc plansza zajmuje
    // 400 z 800 px szerokości i musi być wyśrodkowana.
    expect(vp.cellPx).toBeCloseTo(4, 6);
    expect(vp.originX).toBeCloseTo(-50, 6); // 400 px zapasu = 100 komórek / 2
  });
});

describe('zoomAt', () => {
  it('zachowuje punkt pod kursorem', () => {
    const vp = createViewport(config);
    const before = screenToCell(vp, 120, 300)!;
    const zoomed = zoomAt(vp, 2, 120, 300);
    const after = screenToCell(zoomed, 120, 300)!;
    expect(after).toEqual(before);
  });

  it('nie pozwala oddalić poniżej dopasowania', () => {
    const vp = createViewport(config);
    const zoomedOut = zoomAt(vp, 0.1, 200, 400);
    expect(zoomedOut.cellPx).toBeCloseTo(vp.cellPx, 6);
  });

  it('nie pozwala przybliżyć powyżej granicy czytelności', () => {
    let vp = createViewport(config);
    for (let i = 0; i < 20; i++) vp = zoomAt(vp, 2, 200, 400);
    expect(vp.cellPx).toBeCloseTo(MAX_CELL_PX, 6);
  });

  it('nie wypuszcza planszy poza widok', () => {
    let vp = createViewport(config);
    vp = zoomAt(vp, 4, 0, 0);
    expect(vp.originX).toBeGreaterThanOrEqual(0);
    expect(vp.originY).toBeGreaterThanOrEqual(0);
    const viewCellsX = vp.screenWidth / vp.cellPx;
    expect(vp.originX + viewCellsX).toBeLessThanOrEqual(config.boardWidth + 1e-6);
  });
});

describe('panBy', () => {
  it('przesuwa widok o zadaną liczbę pikseli', () => {
    const vp = zoomAt(createViewport(config), 4, 200, 400);
    const moved = panBy(vp, -40, 0);
    expect(moved.originX).toBeCloseTo(vp.originX + 40 / vp.cellPx, 6);
  });

  it('nie wypuszcza planszy poza widok', () => {
    const vp = zoomAt(createViewport(config), 4, 200, 400);
    const far = panBy(vp, -100_000, -100_000);
    const viewCellsX = far.screenWidth / far.cellPx;
    const viewCellsY = far.screenHeight / far.cellPx;
    expect(far.originX + viewCellsX).toBeLessThanOrEqual(config.boardWidth + 1e-6);
    expect(far.originY + viewCellsY).toBeLessThanOrEqual(config.boardHeight + 1e-6);
  });

  it('nie robi nic, gdy plansza jest w całości widoczna', () => {
    const vp = createViewport(config);
    expect(panBy(vp, 200, 200).originX).toBeCloseTo(vp.originX, 6);
  });
});

describe('screenToCell', () => {
  it('mapuje piksel na komórkę', () => {
    const vp = createViewport(config);
    expect(screenToCell(vp, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(screenToCell(vp, 4.5, 4.5)).toEqual({ x: 1, y: 1 });
    expect(screenToCell(vp, 399, 799)).toEqual({ x: 99, y: 199 });
  });

  it('zwraca null poza planszą', () => {
    const vp = createViewport({ ...config, screenWidth: 800 });
    expect(screenToCell(vp, 10, 10)).toBeNull(); // lewy margines po centrowaniu
    expect(screenToCell(vp, 790, 10)).toBeNull();
  });

  it('działa po przybliżeniu', () => {
    const vp = zoomAt(createViewport(config), 4, 200, 400);
    const cell = screenToCell(vp, 200, 400)!;
    expect(cell.x).toBeGreaterThanOrEqual(0);
    expect(cell.x).toBeLessThan(100);
  });
});

describe('fit', () => {
  it('wraca do dopasowania po przybliżeniu', () => {
    const vp = createViewport(config);
    const zoomed = zoomAt(vp, 6, 100, 100);
    const back = fit(zoomed);
    expect(back.cellPx).toBeCloseTo(vp.cellPx, 6);
    expect(back.originX).toBeCloseTo(vp.originX, 6);
    expect(back.originY).toBeCloseTo(vp.originY, 6);
  });
});

describe('viewBox', () => {
  it('opisuje widok w jednostkach komórek', () => {
    const vp = createViewport(config);
    expect(viewBox(vp)).toBe('0 0 100 200');
  });

  it('zmienia się przy przybliżeniu', () => {
    const vp = zoomAt(createViewport(config), 2, 0, 0);
    const [, , w, h] = viewBox(vp).split(' ').map(Number);
    expect(w).toBeCloseTo(50, 6);
    expect(h).toBeCloseTo(100, 6);
  });
});
```

- [ ] **Krok 3: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- viewport
```

Oczekiwane: FAIL — brak modułu `./viewport`.

- [ ] **Krok 4: Zaimplementuj widok**

```typescript
// src/render/viewport.ts
import { Coord } from '../core/types';

/** Górna granica przybliżenia: powyżej ~48 px na komórkę orientacja się rozpada. */
export const MAX_CELL_PX = 48;

export interface ViewportConfig {
  boardWidth: number;
  boardHeight: number;
  screenWidth: number;
  screenHeight: number;
}

export interface Viewport extends ViewportConfig {
  /** Ile pikseli ekranu przypada na jedną komórkę. */
  cellPx: number;
  /** Lewy górny róg widoku, w jednostkach komórek. */
  originX: number;
  originY: number;
}

function fitScale(c: ViewportConfig): number {
  return Math.min(c.screenWidth / c.boardWidth, c.screenHeight / c.boardHeight);
}

/**
 * Ogranicza przesunięcie tak, żeby widok nie wyjechał poza planszę.
 * Gdy plansza mieści się w osi w całości — centrujemy ją, bo poza planszą
 * nie ma czego oglądać.
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
 * Skalowanie zachowujące punkt pod kursorem.
 *
 * Bez tego przybliżanie na planszy 100×200 sprowadza się do zgadywania,
 * gdzie się wyląduje.
 */
export function zoomAt(vp: Viewport, factor: number, screenX: number, screenY: number): Viewport {
  const minPx = fitScale(vp);
  const cellPx = Math.min(MAX_CELL_PX, Math.max(minPx, vp.cellPx * factor));
  if (cellPx === vp.cellPx) return vp;

  // Komórka pod kursorem przed skalowaniem musi zostać pod kursorem po nim.
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

/** Komórka pod punktem ekranu albo null, gdy punkt leży poza planszą. */
export function screenToCell(vp: Viewport, screenX: number, screenY: number): Coord | null {
  const x = Math.floor(vp.originX + screenX / vp.cellPx);
  const y = Math.floor(vp.originY + screenY / vp.cellPx);
  if (x < 0 || y < 0 || x >= vp.boardWidth || y >= vp.boardHeight) return null;
  return { x, y };
}

/** Atrybut `viewBox` w jednostkach komórek — jedyna rzecz, którą zmienia zoom. */
export function viewBox(vp: Viewport): string {
  const w = vp.screenWidth / vp.cellPx;
  const h = vp.screenHeight / vp.cellPx;
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return `${round(vp.originX)} ${round(vp.originY)} ${round(w)} ${round(h)}`;
}

/** Krok zoomu dla przycisków + / − i klawiszy. */
export const ZOOM_STEP = 1.4;
```

- [ ] **Krok 5: Uruchom testy — mają przejść**

```bash
npm run test:core -- viewport
```

Oczekiwane: PASS (14 testów).

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Dodaj matematykę widoku z zoomem i przesuwaniem"
```

---

### Task 2: Interfejs renderera i implementacja SVG

**Files:**
- Create: `src/render/renderer.ts`
- Create: `src/render/svgRenderer.ts`
- Test: `src/render/svgRenderer.spec.ts`
- Modify: `angular.json` (zakres testów aplikacyjnych)

**Interfaces:**
- Consumes: `Board`, `Piece`, `pieceAt` z rdzenia; `Viewport` z Zadania 1.
- Produces:
  - `interface Renderer { draw(board: Board): void; setViewport(vp: Viewport): void; animateExit(pieceId: number, dir: Dir): Promise<void>; animateBounce(pieceId: number, dir: Dir, distance: number): Promise<void>; onPieceClick(cb: (pieceId: number) => void): void; destroy(): void }`
  - `interface DrawStyle { strokeRatio: number; ink: string; paper: string; colored: boolean }`
  - `DEFAULT_STYLE: DrawStyle`
  - `createSvgRenderer(host: SVGSVGElement, style?: Partial<DrawStyle>): Renderer`
  - `pieceGeometry(piece: Piece): { points: string; head: string }` — czysta
    funkcja, testowalna bez DOM

- [ ] **Krok 1: Ustaw zakres testów aplikacyjnych**

Bez tego `ng test` uruchomiłby testy rdzenia po raz drugi, w jsdom.
W `angular.json`, w `architect.test.options`:

```json
{
  "include": [
    "src/app/**/*.spec.ts",
    "src/ui/**/*.spec.ts",
    "src/render/svgRenderer.spec.ts"
  ]
}
```

- [ ] **Krok 2: Napisz failujące testy**

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
  it('prowadzi linię przez środki komórek', () => {
    const g = pieceGeometry(piece(0, 1, [[2, 0], [1, 0], [0, 0]]));
    expect(g.points).toBe('2.5,0.5 1.5,0.5 0.5,0.5');
  });

  it('rysuje grot przed komórką głowy, zgodnie z kierunkiem', () => {
    const right = pieceGeometry(piece(0, 1, [[2, 0], [1, 0]]));
    const left = pieceGeometry(piece(0, 3, [[0, 0], [1, 0]]));
    expect(right.head).not.toBe(left.head);
    // Wierzchołek grotu leży dalej w prawo niż środek komórki głowy.
    const firstX = Number(right.head.split(' ')[0]!.split(',')[0]);
    expect(firstX).toBeGreaterThan(2.5);
  });
});

describe('createSvgRenderer', () => {
  it('rysuje jedną polilinię na element', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    expect(svg.querySelectorAll('polyline').length).toBe(board.pieces.size);
    expect(svg.querySelectorAll('polygon').length).toBe(board.pieces.size);
    r.destroy();
  });

  it('stosuje parametry rysowania ze specyfikacji', () => {
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

  it('jest monochromatyczny domyślnie', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    const colors = new Set(
      [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke')),
    );
    expect(colors.size).toBe(1);
    r.destroy();
  });

  it('koloruje elementy tylko w trybie diagnostycznym', () => {
    const svg = host();
    const r = createSvgRenderer(svg, { colored: true });
    r.draw(board);
    const colors = new Set(
      [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke')),
    );
    expect(colors.size).toBeGreaterThan(1);
    r.destroy();
  });

  it('ustawia viewBox z widoku', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.setViewport(createViewport({ boardWidth: 4, boardHeight: 4, screenWidth: 400, screenHeight: 400 }));
    r.draw(board);
    expect(svg.getAttribute('viewBox')).toBe('0 0 4 4');
    r.destroy();
  });

  it('zamienia kliknięcie na identyfikator elementu', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.setViewport(createViewport({ boardWidth: 4, boardHeight: 4, screenWidth: 400, screenHeight: 400 }));
    r.draw(board);
    const seen: number[] = [];
    r.onPieceClick((id) => seen.push(id));

    // Trafienie liczymy przez współrzędne, nie przez cel zdarzenia: dzięki
    // temu klik w przerwę między liniami też trafia we właściciela komórki.
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true }));
    expect(seen).toEqual([0]);
    r.destroy();
  });

  it('nie zgłasza kliknięcia, gdy wskaźnik zjechał na inny element', () => {
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

  it('nie zgłasza kliknięcia przy wciśniętym modyfikatorze', () => {
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

  it('usuwa element z DOM po animacji wyjazdu', async () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    await r.animateExit(0, 0);
    expect(svg.querySelector('[data-piece="0"]')).toBeNull();
    r.destroy();
  });

  it('zostawia element na miejscu po odbiciu', async () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    await r.animateBounce(2, 2, 1);
    expect(svg.querySelector('[data-piece="2"]')).not.toBeNull();
    r.destroy();
  });

  it('sprząta po sobie', () => {
    const svg = host();
    const r = createSvgRenderer(svg);
    r.draw(board);
    r.destroy();
    expect(svg.children.length).toBe(0);
  });
});
```

- [ ] **Krok 3: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułów `./renderer` i `./svgRenderer`.

- [ ] **Krok 4: Zdefiniuj interfejs renderera**

```typescript
// src/render/renderer.ts
import { Board, Dir } from '../core/types';
import { Viewport } from './viewport';

/**
 * Parametry rysowania zweryfikowane wzrokowo na prototypie (§11).
 * Wartości są w jednostkach podziałki siatki, nie w pikselach — świat SVG
 * jest wyskalowany w komórkach.
 */
export interface DrawStyle {
  /** Grubość linii jako ułamek podziałki. Konfigurator dopuszcza 0.35–0.65. */
  strokeRatio: number;
  ink: string;
  paper: string;
  /** Kolor per element. TRYB DIAGNOSTYCZNY — nigdy w rozgrywce. */
  colored: boolean;
}

export const DEFAULT_STYLE: DrawStyle = {
  strokeRatio: 0.5,
  ink: '#232447',
  paper: '#f6f6fa',
  colored: false,
};

/**
 * Renderer stoi za interfejsem, żeby ewentualna wymiana SVG na Canvas
 * nie dotknęła rdzenia. To jedyne otwarte ryzyko wydajnościowe projektu (§11).
 */
export interface Renderer {
  draw(board: Board): void;
  setViewport(viewport: Viewport): void;
  /** Element wyjeżdża poza planszę śladem głowy. */
  animateExit(pieceId: number, dir: Dir): Promise<void>;
  /** Element wyjeżdża do kontaktu z blokerem i wraca — pokazuje, gdzie stoi bloker. */
  animateBounce(pieceId: number, dir: Dir, distance: number): Promise<void>;
  onPieceClick(callback: (pieceId: number) => void): void;
  destroy(): void;
}
```

- [ ] **Krok 5: Zaimplementuj renderer SVG**

```typescript
// src/render/svgRenderer.ts
import { pieceAt } from '../core/board';
import { Board, Dir, DIR_VECTORS, EMPTY, Piece } from '../core/types';
import { DEFAULT_STYLE, DrawStyle, Renderer } from './renderer';
import { createViewport, screenToCell, Viewport } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EXIT_MS = 260;
const BOUNCE_MS = 320;

/** Geometria elementu w jednostkach komórek. Czysta funkcja — testowalna bez DOM. */
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
   * Trafienie liczymy przez WSPÓŁRZĘDNE, nie przez `event.target`.
   * Kliknięcie w przerwę między dwiema liniami tego samego elementu też musi
   * trafić w jego właściciela — mapowanie piksel → komórka → occupancy → id
   * jest wspólne dla myszy i dotyku (§11).
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
    // Przeciąganie planszy wymaga modyfikatora, więc z modyfikatorem
    // NIE zaczynamy ruchu w grze — pomyłka kosztuje życie (§11).
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
    // Standardowa semantyka przycisku: ruch dopiero przy zwolnieniu i tylko
    // nad tym samym elementem, na którym wciśnięto.
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

    // W jsdom `animate` nie istnieje — wtedy pomijamy animację i od razu
    // wykonujemy jej skutek. Test sprawdza skutek, nie ruch.
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
      // Zoom i przesuwanie to JEDNA zmiana atrybutu — bez przerysowywania
      // ścieżek. To główny powód, dla którego SVG broni się mimo skali (§11).
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

- [ ] **Krok 6: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS. Jeśli test kliknięcia zawodzi, sprawdź, czy jsdom zwraca
sensowne `getBoundingClientRect` — w razie potrzeby ustaw w teście
`host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 } as DOMRect)`.

- [ ] **Krok 7: Commit**

```bash
git add -A
git commit -m "Dodaj renderer SVG planszy"
```

---

### Task 3: Podgląd i budżet wydajności

**Files:**
- Create: `tools/render-preview.ts`
- Create: `docs/benchmarks/2026-09-07-render.md` (wynik pomiaru)
- Modify: `package.json` (skrypt `preview`)

**Interfaces:**
- Produces: pliki SVG do oceny wzrokowej oraz pomiar czasu rysowania.

To jest moment, w którym **kalibracja wyglądu staje się możliwa**. Prototyp
zamknął się na podglądzie ASCII, który nie potrafi przedstawić ścieżki
dotykającej samej siebie — a przy zwinięciu 35% to co trzecia komórka.

- [ ] **Krok 1: Napisz generator podglądu**

```typescript
// tools/render-preview.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { createLevel } from '../src/core/level';
import { BoardFormat, LevelId } from '../src/core/presets';
import { DEFAULT_STYLE } from '../src/render/renderer';
import { pieceGeometry } from '../src/render/svgRenderer';
import { Board } from '../src/core/types';

/** Ten sam kod geometrii co renderer — podgląd nie może się od niego rozjechać. */
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
    `  elementów ${board.pieces.size}, śr. dł. ${report.meanLength.toFixed(1)}, ` +
    `max ${report.maxLength}\n` +
    `  f0 ${board.metrics.f0.toFixed(3)}, almost1 ` +
    `${((100 * board.metrics.almost1) / board.metrics.n).toFixed(0)}%, D ${board.metrics.d}\n` +
    `  generacja ${genMs.toFixed(0)} ms, serializacja SVG ${svgMs.toFixed(0)} ms\n` +
    `  zapisano do ${outDir}/`,
);
```

Dodaj skrypt w `package.json`:

```json
{
  "preview": "tsx tools/render-preview.ts"
}
```

- [ ] **Krok 2: Obejrzyj planszę i skalibruj wygląd**

```bash
npm run preview -- --level=easy --format=tall --cell=14
open preview/easy-tall.svg
```

Porównaj z referencją opisaną w §11: **gęsto usiane groty plus kilka bardzo
długich linii**. Jeśli plansza wygląda na rozwleczoną, waga koszyka długiego
jest za wysoka; jeśli to sama sieczka z haczyków — za niska.

Sprawdź też wariant diagnostyczny (`-diag.svg`), gdzie każdy element ma inny
kolor — służy do zweryfikowania, że elementy naprawdę są tak splątane, jak
sugeruje wersja monochromatyczna.

- [ ] **Krok 3: Zmierz budżet wydajności**

```bash
npm run preview -- --level=nightmare --format=tall --cell=6
```

Zanotuj liczbę elementów i czas. To jest **jedyne otwarte pytanie
wydajnościowe projektu** (§11): czy SVG wyrobi przy ~2 300 ścieżkach.

Następnie sprawdź to w przeglądarce, bo serializacja stringa to nie to samo,
co układanie DOM:

```bash
npx ng serve
```

Po wykonaniu Slice'a 7 wróć tu i zmierz w DevTools trzy rzeczy, zapisując
wynik do `docs/benchmarks/2026-09-07-render.md`:

1. czas od `draw()` do pierwszej klatki dla Nightmare 100×200,
2. płynność przy ciągłym przewijaniu (zoom + pan) — liczba klatek na sekundę,
3. zużycie pamięci karty.

**Próg decyzyjny:** jeśli pierwsza klatka przekracza 1 s albo zoom spada
poniżej 30 fps, wymieniamy `svgRenderer` na implementację Canvas. Rdzeń tego
nie zauważy — renderer stoi za interfejsem właśnie na tę okoliczność.

- [ ] **Krok 4: Dopisz `preview/` do `.gitignore`**

```bash
printf '\n# podglądy renderera\npreview/\n' >> .gitignore
```

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj podgląd renderera i pomiar wydajności"
```

---

## Kryteria odbioru slice'a

- `npm run test:core` i `npx ng test` przechodzą.
- Zoom zachowuje punkt pod kursorem (test), nie schodzi poniżej dopasowania
  i nie przekracza 48 px na komórkę.
- Przesuwanie nie wypuszcza planszy poza widok.
- Renderer rysuje jedną polilinię i jeden grot na element, monochromatycznie.
- Kliknięcie mapuje się przez współrzędne na `occupancy`, wymaga zwolnienia nad
  tym samym elementem i jest blokowane przez modyfikator ⌘/Ctrl.
- `npm run preview` produkuje SVG, które da się porównać z referencją.
- Pomiar wydajności Nightmare jest zanotowany w `docs/benchmarks/`.
