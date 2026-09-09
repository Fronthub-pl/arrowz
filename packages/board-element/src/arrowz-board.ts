// The board element: a Lit shell for the chrome (zoom buttons, pan hint)
// around one <svg> owned by SvgLayer. Lit never renders the pieces; it
// renders the handful of nodes around them. The viewport is pure math from
// viewport.ts, the pointer rules are the state machine of gestures.ts, and
// this file only wires DOM events to both and exposes the public API.
import { css, html, LitElement, type PropertyValues } from 'lit'
import type { Board } from '@arrowz/engine'
import { GestureMachine, type Intent, type PointerSample } from './gestures.ts'
import { labelsFor } from './i18n.ts'
import { type BoardView, DEFAULT_VIEW, SvgLayer } from './svg-layer.ts'
import { fit, panBy, resize, screenToCell, viewBox, type Viewport, zoomAt, zoomBy } from './viewport.ts'

export interface BoardViewport {
  cellPx: number
  originX: number
  originY: number
  fitted: boolean
  hostWidth: number
  hostHeight: number
}

export type PieceClickEvent = CustomEvent<{ pieceId: number }>
export type ViewportChangeEvent = CustomEvent<BoardViewport>

/** One button or key press scales by this factor. */
export const ZOOM_STEP = 1.25
/** Wheel factor per event: exp(-deltaY * WHEEL_RATE), smooth for trackpads and mice alike. */
export const WHEEL_RATE = 0.0015

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** Field for field: the six numbers and the flag the consumer is told about. */
function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.cellPx === b.cellPx && a.originX === b.originX && a.originY === b.originY &&
    a.hostWidth === b.hostWidth && a.hostHeight === b.hostHeight && a.fitted === b.fitted
}

export class ArrowzBoard extends LitElement {
  static properties = {
    board: { attribute: false },
    view: { attribute: false },
    interactive: { type: Boolean, reflect: true },
    // No accessor: the native HTMLElement.lang stays in force, so the property
    // and the attribute never disagree (`:lang()`, hyphenation and assistive
    // tech read the attribute). attributeChangedCallback below asks for the
    // re-render that the missing accessor would have asked for.
    lang: { type: String, noAccessor: true },
  }

  declare board: Board | null
  declare view: Partial<BoardView>
  declare interactive: boolean

  static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      outline: none;
      background: #f6f6fa;
    }
    :host(:focus-visible) {
      outline: 2px solid #4a7cff;
      outline-offset: -2px;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    :host([interactive]) svg.over-piece {
      cursor: pointer;
    }
    svg.panning {
      cursor: grabbing;
    }
    .chrome {
      position: absolute;
      right: 8px;
      bottom: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .hint {
      font: 12px system-ui, sans-serif;
      color: #232447;
      opacity: 0.7;
      margin-right: 6px;
    }
    button {
      width: 32px;
      height: 32px;
      border: 1px solid #c9c9d6;
      border-radius: 6px;
      background: #fff;
      color: #232447;
      font: 18px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    button:hover {
      background: #eef;
    }
    @media (pointer: coarse) {
      .hint {
        display: none;
      }
    }
  `

  private readonly layer = new SvgLayer()
  private readonly gestures = new GestureMachine()
  private vp: Viewport | null = null
  private observer: ResizeObserver | null = null
  private hostWidth = 0
  private hostHeight = 0
  private changeQueued = false

  constructor() {
    super()
    this.board = null
    this.view = {}
    this.interactive = false
    const svg = this.layer.svg
    svg.addEventListener('pointerdown', this.onPointerDown)
    svg.addEventListener('pointermove', this.onPointerMove)
    svg.addEventListener('pointerup', this.onPointerUp)
    svg.addEventListener('pointercancel', this.onPointerCancel)
    // Not passive: the browser zoom must not fire on Ctrl/⌘ + wheel.
    svg.addEventListener('wheel', this.onWheel, { passive: false })
    svg.addEventListener('dblclick', this.onDoubleClick)
    this.addEventListener('keydown', this.onKeyDown)
  }

  static override get observedAttributes(): string[] {
    const base = super.observedAttributes
    return base.includes('lang') ? [...base] : [...base, 'lang']
  }

  override attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    super.attributeChangedCallback(name, old, value)
    // `lang` has no Lit accessor, so nothing else would schedule the update.
    if (name === 'lang') this.requestUpdate('lang')
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) this.onResize(entry.contentRect.width, entry.contentRect.height)
    })
    this.observer.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.observer = null
  }

  override render() {
    const l = labelsFor(this.lang)
    return html`
      ${this.layer.svg}
      <div class="chrome">
        <span class="hint">${isMac ? l.panHintMac : l.panHintOther}</span>
        <button type="button" title=${l.zoomIn} aria-label=${l.zoomIn} @click=${() => this.zoomBy(ZOOM_STEP)}>+</button>
        <button type="button" title=${l.zoomOut} aria-label=${l.zoomOut} @click=${() =>
          this.zoomBy(1 / ZOOM_STEP)}>−</button>
        <button type="button" title=${l.fit} aria-label=${l.fit} @click=${() => this.fit()}>⤢</button>
      </div>
    `
  }

  override updated(changed: PropertyValues<this>): void {
    if (!changed.has('board') && !changed.has('view')) return
    const previous = this.layer.board
    this.layer.setBoard(this.board, { ...DEFAULT_VIEW, ...this.view })
    // A view change repaints the same cells: the viewport is the board's
    // geometry against the host, and neither of those moved.
    if (!changed.has('board')) return
    const sizeChanged = !previous || !this.board || previous.W !== this.board.W || previous.H !== this.board.H
    if (sizeChanged) this.vp = null
    this.syncViewport()
  }

  // --- public API ------------------------------------------------------------

  get viewport(): BoardViewport | null {
    const v = this.vp
    if (!v) return null
    return {
      cellPx: v.cellPx,
      originX: v.originX,
      originY: v.originY,
      fitted: v.fitted,
      hostWidth: v.hostWidth,
      hostHeight: v.hostHeight,
    }
  }

  fit(): void {
    if (!this.vp) return
    this.setViewport(fit(this.vp))
  }

  zoomBy(factor: number): void {
    if (!this.vp) return
    this.setViewport(zoomBy(this.vp, factor))
  }

  animateExit(pieceId: number, dir: number): Promise<void> {
    return this.layer.animateExit(pieceId, dir)
  }

  shake(pieceId: number, distance: number): Promise<void> {
    return this.layer.shake(pieceId, distance)
  }

  // --- viewport --------------------------------------------------------------

  private onResize(width: number, height: number): void {
    this.hostWidth = width
    this.hostHeight = height
    this.syncViewport()
  }

  /** Creates or adapts the viewport once both a board and a host size exist. */
  private syncViewport(): void {
    const board = this.board
    if (!board || this.hostWidth <= 0 || this.hostHeight <= 0) {
      this.vp = null
      this.layer.svg.removeAttribute('viewBox')
      return
    }
    const input = { W: board.W, H: board.H, hostWidth: this.hostWidth, hostHeight: this.hostHeight }
    this.setViewport(this.vp ? resize(this.vp, input.hostWidth, input.hostHeight) : fit(input))
  }

  private setViewport(v: Viewport): void {
    const previous = this.vp
    this.vp = v
    // A resize that changes nothing (a repaint, a host size set to what it
    // already was) must not repaint the attribute nor wake the consumer.
    if (previous !== null && sameViewport(previous, v)) return
    this.layer.svg.setAttribute('viewBox', viewBox(v))
    if (this.changeQueued) return
    this.changeQueued = true
    requestAnimationFrame(() => {
      this.changeQueued = false
      const detail = this.viewport
      if (detail) this.dispatchEvent(new CustomEvent('viewport-change', { detail, bubbles: true, composed: true }))
    })
  }

  // --- input -----------------------------------------------------------------

  private sample(e: PointerEvent): PointerSample {
    const r = this.layer.svg.getBoundingClientRect()
    const kind = e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse'
    return {
      id: e.pointerId,
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      kind,
      modifier: e.metaKey || e.ctrlKey,
      t: e.timeStamp,
    }
  }

  private pieceAt(px: number, py: number): number | null {
    const board = this.board
    if (!board || !this.vp) return null
    const cell = screenToCell(this.vp, px, py)
    if (!cell) return null
    // owner holds the piece id, -1 for an uncarved cell and -2 for a void.
    const id = board.owner[cell.y * board.W + cell.x]
    return id === undefined || id < 0 || this.layer.isExiting(id) ? null : id
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    // Synthetic events in tests have no active pointer; capture is best effort.
    try {
      this.layer.svg.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    this.apply(this.gestures.down(this.sample(e)))
    const panning = this.gestures.panning
    // The pointer cursor of a piece under the press outranks the grab cursor,
    // and a pan stops refreshing it, so it has to go before the pan starts.
    if (panning) this.layer.svg.classList.remove('over-piece')
    this.layer.svg.classList.toggle('panning', panning)
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const s = this.sample(e)
    this.apply(this.gestures.move(s))
    if (!this.gestures.panning) this.layer.svg.classList.toggle('over-piece', this.pieceAt(s.x, s.y) !== null)
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.apply(this.gestures.up(this.sample(e)))
    this.layer.svg.classList.remove('panning')
  }

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.gestures.cancel(e.pointerId)
    this.layer.svg.classList.remove('panning')
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    if (!this.vp) return
    const r = this.layer.svg.getBoundingClientRect()
    this.setViewport(zoomAt(this.vp, Math.exp(-e.deltaY * WHEEL_RATE), e.clientX - r.left, e.clientY - r.top))
  }

  private readonly onDoubleClick = (): void => {
    this.fit()
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === '+' || e.key === '=') this.zoomBy(ZOOM_STEP)
    else if (e.key === '-') this.zoomBy(1 / ZOOM_STEP)
    else if (e.key === '0') this.fit()
    else return
    e.preventDefault()
  }

  private apply(intent: Intent): void {
    if (intent.type === 'none') return
    if (intent.type === 'fit') {
      this.fit()
      return
    }
    if (!this.vp) return
    if (intent.type === 'pan') {
      this.setViewport(panBy(this.vp, intent.dx, intent.dy))
      return
    }
    if (intent.type === 'pinch') {
      this.setViewport(panBy(zoomAt(this.vp, intent.factor, intent.x, intent.y), intent.dx, intent.dy))
      return
    }
    if (!this.interactive) return
    const pressed = this.pieceAt(intent.pressX, intent.pressY)
    const released = this.pieceAt(intent.x, intent.y)
    if (pressed === null || pressed !== released) return
    this.dispatchEvent(new CustomEvent('piece-click', { detail: { pieceId: pressed }, bubbles: true, composed: true }))
  }
}

if (!customElements.get('arrowz-board')) customElements.define('arrowz-board', ArrowzBoard)
