// The board element: a Lit shell for the chrome (zoom buttons, pan hint)
// around one <canvas> owned by GlLayer. Lit never renders the pieces; it
// renders the handful of nodes around them. The viewport is pure math from
// viewport.ts, the pointer rules are the state machine of gestures.ts, and
// this file only wires DOM events to both and exposes the public API.
import { css, html, LitElement, type PropertyValues } from 'lit'
import type { Board, SessionSnapshot } from '@arrowz/engine'
import { type GameEvent, GameHost, type GameTarget } from './game-host.ts'
import { GestureMachine, type GestureMode, type Intent, type PointerSample } from './gestures.ts'
import { GlLayer } from './gl-layer.ts'
import { type BoardLabels, labelsFor } from './i18n.ts'
import { drawableColor, drawablePad, drawablePointRadius, drawableView } from './sanitize.ts'
import { type BoardView, DEFAULT_VIEW } from './view.ts'
import { fit, MIN_POINT_CELL_PX, panBy, resize, screenToCell, type Viewport, zoomAt, zoomBy } from './viewport.ts'

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
export type PieceRemovedEvent = CustomEvent<{ pieceId: number; left: number }>
export type LifeLostEvent = CustomEvent<{ pieceId: number; blockerId: number; distance: number }>
export type FinishedEvent = CustomEvent<{ pieces: number }>

/** One button or key press scales by this factor. */
export const ZOOM_STEP = 1.25
/** Wheel factor per event: exp(-deltaY * WHEEL_RATE), smooth for trackpads and mice alike. */
export const WHEEL_RATE = 0.0015
/**
 * Cells of margin drawn around the board unless the `pad` attribute says
 * otherwise. Without one an arrowhead in an edge cell ends two hundredths of a
 * cell from the paper's edge, which reads as the board cutting it off.
 */
export const DEFAULT_PAD = 4
/** Default of `showPoints`: the point grid is off unless a host asks for it. */
export const DEFAULT_SHOW_POINTS = false
/** Default of `pointColor`: the point grid's dot colour. */
export const DEFAULT_POINT_COLOR = '#c9c9d6'
/** Default of `pointRadius`: the point grid's dot radius, in cells. */
export const DEFAULT_POINT_RADIUS = 0.06
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

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** The browser's own colour parser, so anything `view.ink` may say is judged the way it will be drawn. */
const isCssColor = (c: string): boolean => typeof CSS !== 'undefined' && CSS.supports('color', c)

/** Field for field: the six numbers and the flag the consumer is told about. */
function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.cellPx === b.cellPx && a.originX === b.originX && a.originY === b.originY &&
    a.hostWidth === b.hostWidth && a.hostHeight === b.hostHeight && a.fitted === b.fitted
}

export class ArrowzBoard extends LitElement implements GameTarget {
  static properties = {
    board: { attribute: false },
    view: { attribute: false },
    interactive: { type: Boolean, reflect: true },
    play: { type: Boolean, reflect: true },
    // useDefault, here and on pointRadius below: the constructor's initial
    // value must not be the one Lit reflects back once an attribute has
    // since corrected the property to something else (a plain
    // `reflect: true` schedules that reflection at construction time, before
    // any attribute is read, and flushes it with whatever the property holds
    // by the first update — see the "nonsense" pad and point-radius tests).
    pad: { type: Number, reflect: true, useDefault: true },
    showPoints: { type: Boolean, reflect: true, attribute: 'show-points' },
    pointColor: { type: String, reflect: true, attribute: 'point-color' },
    pointRadius: { type: Number, reflect: true, attribute: 'point-radius', useDefault: true },
    // No accessor: the native HTMLElement.lang stays in force, so the property
    // and the attribute never disagree (`:lang()`, hyphenation and assistive
    // tech read the attribute). attributeChangedCallback below asks for the
    // re-render that the missing accessor would have asked for.
    lang: { type: String, noAccessor: true },
    enableColors: { type: Boolean, reflect: true, attribute: 'enable-colors' },
    coloredOverride: { state: true },
    chosenMode: { state: true },
  }

  declare board: Board | null
  declare view: Partial<BoardView>
  declare interactive: boolean
  /** Runs the reducer: a click plays the board instead of only reporting. Implies interactivity. */
  declare play: boolean
  /** Margin around the board, in cells. See DEFAULT_PAD. */
  declare pad: number
  /** Whether the point grid is drawn under the pieces. See DEFAULT_SHOW_POINTS. */
  declare showPoints: boolean
  /** Colour of the point grid's dots. */
  declare pointColor: string
  /** Radius of the point grid's dots, in cells. */
  declare pointRadius: number
  /** Permission to colour the board. Without it the element is monochrome and shows no button. */
  declare enableColors: boolean
  /** The button's choice; null while the board still follows `view.colored`. */
  declare coloredOverride: boolean | null
  /** The player's gesture choice, from storage on connect and from the switch after. */
  declare chosenMode: GestureMode

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
    canvas {
      /* Out of the flow: a canvas in it lends the host its intrinsic size, and
        since the canvas is sized to the host, the host's height would depend
        on whatever size it had before (spec §9). The host is sized by its
        consumer, like any <div>. */
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      /* Without this the browser claims the touch for a scroll or a pinch
        before the pointer events reach the gesture machine, exactly as it
        would have on the <svg> these rules used to name. */
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    :host([interactive]) canvas.over-piece,
    :host([play]) canvas.over-piece {
      cursor: pointer;
    }
    canvas.pan-ready {
      cursor: grab;
    }
    canvas.panning {
      cursor: grabbing;
    }
    .unsupported {
      display: grid;
      place-items: center;
      height: 100%;
      margin: 0;
      padding: 1rem;
      text-align: center;
      font: 14px system-ui, sans-serif;
      color: #232447;
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
    button[aria-pressed='true'] {
      background: #dde;
    }
    @media (pointer: coarse) {
      .hint,
      .gestures {
        display: none;
      }
    }
  `

  private readonly layer = new GlLayer()
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
  private readonly gestures = new GestureMachine()
  private readonly game = new GameHost(this)
  private vp: Viewport | null = null
  private observer: ResizeObserver | null = null
  /** Set while a disconnect waits to see whether it was only a move; see `disconnectedCallback`. */
  private disposeQueued = false
  /** Where the pointer last was, to redraw the cursor when the modifier changes without a move. */
  private lastPointer: { x: number; y: number } | null = null
  private modifierHeld = false
  private hostWidth = 0
  private hostHeight = 0
  private changeQueued = false

  constructor() {
    super()
    this.board = null
    this.view = {}
    this.interactive = false
    this.play = false
    this.pad = DEFAULT_PAD
    this.showPoints = DEFAULT_SHOW_POINTS
    this.pointColor = DEFAULT_POINT_COLOR
    this.pointRadius = DEFAULT_POINT_RADIUS
    this.enableColors = false
    this.coloredOverride = null
    this.chosenMode = 'drag'
    const canvas = this.layer.canvas
    canvas.addEventListener('pointerenter', this.onPointerEnter)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    // A capture taken away (a context menu, the element leaving the tree) is a
    // gesture that will get no release. The browser also sends one after every
    // ordinary release, and cancelling a gesture that already ended is a no-op
    // in the machine.
    canvas.addEventListener('lostpointercapture', this.onPointerCancel)
    canvas.addEventListener('contextmenu', this.onContextMenu)
    // Not passive: the browser zoom must not fire on Ctrl/⌘ + wheel.
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.addEventListener('keydown', this.onKeyDown)
    this.layer.onForeignLoss = () => this.watchForRevival()
  }

  static override get observedAttributes(): string[] {
    const base = super.observedAttributes
    return base.includes('lang') ? [...base] : [...base, 'lang']
  }

  override attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    // `lang` has no Lit accessor, so nothing else would schedule the update.
    // Lit is not told about it either: its write-back of the converted value
    // is pure churn on top of the native accessor, and on a removal it would
    // hand the non-nullable HTMLElement.lang a null, which becomes "null".
    if (name === 'lang') {
      this.requestUpdate('lang')
      return
    }
    super.attributeChangedCallback(name, old, value)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.chosenMode = storedMode()
    // Back before the queued disposal ran: this was a move, not a removal.
    this.disposeQueued = false
    // The first connect: the layer takes its very first context here, at once.
    // Back after a removal: the layer gave its context up, and asks for it
    // again. A no-op on a board that never left, and a context asked back
    // arrives on its own event, so nothing here waits for it.
    this.layer.restore()
    if (!this.acquired) {
      this.acquired = true
      this.hasWebgl = this.layer.supported
    }
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) this.onResize(entry.contentRect.width, entry.contentRect.height)
    })
    this.observer.observe(this)
  }

  /**
   * A WebGL context is not garbage collected on the browser's own schedule:
   * a page holds around sixteen of them at a time, and the oldest is taken
   * away to make room for a new one, so a board that is removed without
   * handing its context back is a board that steals another board's.
   *
   * The disposal waits one microtask because moving a node between parents is
   * a removal and an insertion in the same task: `connectedCallback` clears
   * the flag, and only a disconnect that is still a disconnect once the task
   * ends takes the context down. A board attached again later is not left
   * blank either — `connectedCallback` asks the layer for a context back —
   * but that costs a rebuild, and a move should cost nothing.
   */
  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.observer = null
    // A board removed while the pointer was over it never gets its leave.
    this.stopWatchingModifier()
    this.stopRevival()
    this.disposeQueued = true
    queueMicrotask(() => {
      if (!this.disposeQueued) return
      this.disposeQueued = false
      this.layer.dispose()
    })
  }

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

  override render() {
    const l = labelsFor(this.lang)
    return html`
      ${this.hasWebgl ? this.layer.canvas : html`<p class="unsupported">${l.noWebgl}</p>`}
      <div class="chrome">
        <span class="hint">${this.hint(l)}</span>
        <button type="button" title=${l.zoomIn} aria-label=${l.zoomIn} @click=${() => this.zoomBy(ZOOM_STEP)}>+</button>
        <button type="button" title=${l.zoomOut} aria-label=${l.zoomOut} @click=${() =>
          this.zoomBy(1 / ZOOM_STEP)}>−</button>
        <button type="button" title=${l.fit} aria-label=${l.fit} @click=${() => this.fit()}>⤢</button>
        ${this.enableColors
          ? html`
            <button
              type="button"
              class="colors"
              title=${l.colors}
              aria-label=${l.colors}
              aria-pressed=${this.colored ? 'true' : 'false'}
              @click=${() => this.coloredOverride = !this.colored}
            >◑</button>
          `
          : ''}
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
      </div>
    `
  }

  private hint(l: BoardLabels): string {
    if (this.gestureMode === 'click') return isMac ? l.clickHintMac : l.clickHintOther
    if (!this.playable) return l.dragHint
    return isMac ? l.dragPlayHintMac : l.dragPlayHintOther
  }

  private readonly toggleGestures = (): void => {
    this.chosenMode = this.chosenMode === 'click' ? 'drag' : 'click'
    storeMode(this.chosenMode)
  }

  override updated(changed: PropertyValues<this>): void {
    // Applies from the next press (see GestureMachine.mode), so a change mid-drag is safe.
    this.gestures.mode = this.gestureMode
    if (changed.has('chosenMode') || changed.has('play') || changed.has('interactive')) this.refreshCursor()
    // Independent of everything below: the grid lives in its own two nodes,
    // and re-reading `this.vp` here is what lets a plain colour or radius
    // change (no board, no viewport move) still repaint it.
    if (changed.has('showPoints') || changed.has('pointColor') || changed.has('pointRadius')) this.updatePoints()
    if (
      !changed.has('board') && !changed.has('view') && !changed.has('pad') &&
      !changed.has('coloredOverride') && !changed.has('enableColors')
    ) return
    const previous = this.layer.board
    this.syncSession()
    this.redraw()
    // The margin is part of what the board is fitted into, so changing it
    // refits: it is a setting, not something touched during play.
    if (changed.has('pad')) {
      this.vp = null
      this.syncViewport()
      return
    }
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

  /** How many pieces the layer is drawing; the board's own count, not the DOM's. */
  get pieceCount(): number {
    return this.layer.pieceCount
  }

  /** The rule the mouse and pen follow now: the player's choice on a playable board, `drag` otherwise. */
  get gestureMode(): GestureMode {
    return this.playable ? this.chosenMode : 'drag'
  }

  /** Whether a click can do anything: a board that only pans has only panning to choose. */
  private get playable(): boolean {
    return this.play || this.interactive
  }

  fit(): void {
    if (!this.vp) return
    this.setViewport(fit(this.vp))
  }

  zoomBy(factor: number): void {
    if (!this.vp || !Number.isFinite(factor) || factor <= 0) return
    this.setViewport(zoomBy(this.vp, factor))
  }

  animateExit(pieceId: number, dir: number): Promise<void> {
    return this.layer.animateExit(pieceId, dir)
  }

  shake(pieceId: number, distance: number): Promise<void> {
    return this.layer.shake(pieceId, distance)
  }

  /** The game in progress, as a value the host can store. */
  saveState(): SessionSnapshot | null {
    this.syncSession()
    return this.game.save(this.colored)
  }

  /** Restores a game saved by `saveState`. Throws when the snapshot is not this board's. */
  loadState(snap: SessionSnapshot): void {
    this.syncSession()
    this.game.load(snap)
    // Without the permission `saveState()` always records `colored: false`
    // (§6): honouring it here would pin the override to false and outlive a
    // later grant of the permission, so it only travels when it can be true.
    if (this.enableColors) this.coloredOverride = snap.colored
    this.redraw()
  }

  /** Drops the game and puts every piece back. */
  restart(): void {
    this.syncSession()
    this.game.setBoard(this.board)
    this.redraw()
  }

  /**
   * Reconciles the session with `board` for a caller that runs between
   * `this.board = ...` and Lit's next, asynchronous `updated()`: without this,
   * `saveState`/`loadState`/`restart` called in that window would see the
   * previous session, or none. A no-op when the two already agree, so it never
   * forces a needless rebuild of the session or its `gone` set.
   */
  private syncSession(): void {
    if (this.game.board !== this.board) this.game.setBoard(this.board)
  }

  /**
   * Whether the pieces are drawn in their own hues. The permission wins over
   * everything: monochrome is part of the task (design §11), so a host has to
   * ask for the exception before either the button or `view.colored` counts.
   */
  private get colored(): boolean {
    return this.enableColors && (this.coloredOverride ?? this.view.colored ?? false)
  }

  /** Draws the board as the session now stands. */
  private redraw(): void {
    this.layer.setBoard(
      this.board,
      drawableView({ ...DEFAULT_VIEW, ...this.view, colored: this.colored }, isCssColor),
      this.game.goneIds,
    )
  }

  /**
   * Tells the layer whether to draw the point grid. Only this element knows
   * `cellPx`, so it — not the layer — decides: `showPoints` asks for the
   * grid, but below `MIN_POINT_CELL_PX` the raster would moiré, so the
   * viewport can veto it without `showPoints` itself ever changing. Called on
   * every viewport change as well as on the three properties, so zooming past
   * the threshold hides or restores the grid with no property touched.
   */
  private updatePoints(): void {
    const visible = this.showPoints && this.vp !== null && this.vp.cellPx >= MIN_POINT_CELL_PX
    this.layer.setPoints(
      visible,
      drawableColor(this.pointColor, DEFAULT_POINT_COLOR, isCssColor),
      drawablePointRadius(this.pointRadius, DEFAULT_POINT_RADIUS),
    )
  }

  /** GameTarget: the game host reaches the board through these three. */
  emit(event: GameEvent): void {
    this.dispatchEvent(new CustomEvent(event.type, { detail: event.detail, bubbles: true, composed: true }))
  }

  // --- viewport --------------------------------------------------------------

  private onResize(width: number, height: number): void {
    this.hostWidth = width
    this.hostHeight = height
    this.syncViewport()
  }

  /** Creates or adapts the viewport once both a board and a host size exist. */
  private syncViewport(): void {
    const pad = drawablePad(this.pad, DEFAULT_PAD)
    const board = this.board
    if (!board || this.hostWidth <= 0 || this.hostHeight <= 0) {
      this.vp = null
      this.layer.pad = pad
      this.updatePoints()
      return
    }
    const input = { W: board.W, H: board.H, hostWidth: this.hostWidth, hostHeight: this.hostHeight, pad }
    this.setViewport(this.vp ? resize(this.vp, input.hostWidth, input.hostHeight) : fit(input))
  }

  private setViewport(v: Viewport): void {
    const previous = this.vp
    this.vp = v
    // The paper is drawn to the margin the view actually keeps, not the one
    // asked for: below the pixel floor those differ, and a paper narrower than
    // the view would leave a bare strip around the board.
    this.layer.pad = v.margin
    this.updatePoints()
    // A resize that changes nothing (a repaint, a host size set to what it
    // already was) must not ask for a frame nor wake the consumer.
    if (previous !== null && sameViewport(previous, v)) return
    this.layer.setViewport(v)
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
    const r = this.layer.canvas.getBoundingClientRect()
    const kind = e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse'
    return {
      id: e.pointerId,
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      kind,
      modifier: e.metaKey || e.ctrlKey,
      t: e.timeStamp,
      // The browser's own repeat count: 2 on the second click of a double,
      // 3 on a triple, and so on. Only mouse/pen deliver it; touch's own
      // double-tap detection lives in the gesture machine instead.
      repeat: e.detail >= 2,
      pressed: (e.buttons & 1) !== 0,
      primary: e.isPrimary,
    }
  }

  private pieceAt(px: number, py: number): number | null {
    const board = this.board
    if (!board || !this.vp) return null
    const cell = screenToCell(this.vp, px, py)
    if (!cell) return null
    // owner holds the piece id, -1 for an uncarved cell and -2 for a void.
    const id = board.owner[cell.y * board.W + cell.x]
    if (id === undefined || id < 0) return null
    return this.layer.isExiting(id) || this.game.isGone(id) ? null : id
  }

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

  // ⌘-Tab hands the keyup to another window, so the modifier would stay
  // "held". Worse, the press itself is stranded: its eventual release, if
  // one ever arrives, will land back over the board as a plain hover move
  // with no button held, which the gesture machine reads as that release —
  // playing a click nobody meant. Cancelling the gesture here, before that
  // move can arrive, keeps it from ever being asked to decide.
  private readonly onWindowBlur = (): void => {
    this.gestures.cancelAll()
    this.layer.canvas.classList.remove('panning')
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

  private readonly onPointerDown = (e: PointerEvent): void => {
    // Only the primary button starts a press: a right-click or a middle-click
    // is not a board gesture. The machine never sees it, and the later move and
    // up for an unknown pointer id are no-ops, so nothing has to be undone.
    if (e.button !== 0 && e.pointerType !== 'touch') return
    // Synthetic events in tests have no active pointer; capture is best effort.
    try {
      this.layer.canvas.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    this.apply(this.gestures.down(this.sample(e)))
    const panning = this.gestures.panning
    // The pointer cursor of a piece under the press outranks the grab cursor,
    // and a pan stops refreshing it, so it has to go before the pan starts.
    if (panning) this.layer.canvas.classList.remove('over-piece')
    this.layer.canvas.classList.toggle('panning', panning)
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const s = this.sample(e)
    this.lastPointer = { x: s.x, y: s.y }
    this.apply(this.gestures.move(s))
    if (!this.gestures.panning) this.layer.canvas.classList.remove('panning')
    if (this.gestures.panning) return
    this.setModifier(e.metaKey || e.ctrlKey)
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.apply(this.gestures.up(this.sample(e)))
    this.layer.canvas.classList.remove('panning')
    this.refreshCursor()
  }

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.gestures.cancel(e.pointerId)
    this.layer.canvas.classList.remove('panning')
    this.refreshCursor()
  }

  private readonly onWheel = (e: WheelEvent): void => {
    // Without a viewport there is nothing to zoom, and swallowing the scroll of
    // an empty or unsized element would only break the page around it.
    if (!this.vp) return
    e.preventDefault()
    const r = this.layer.canvas.getBoundingClientRect()
    this.setViewport(zoomAt(this.vp, Math.exp(-e.deltaY * WHEEL_RATE), e.clientX - r.left, e.clientY - r.top))
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // ⌘/Ctrl + -, + and 0 are the browser's page zoom, and Alt belongs to
    // the platform; without a viewport there is nothing to zoom, and the
    // wheel does not swallow its event there either.
    if (e.metaKey || e.ctrlKey || e.altKey || !this.vp) return
    if (e.key === '+' || e.key === '=') this.zoomBy(ZOOM_STEP)
    else if (e.key === '-') this.zoomBy(1 / ZOOM_STEP)
    else if (e.key === '0') this.fit()
    else return
    e.preventDefault()
  }

  private apply(intent: Intent): void {
    if (intent.type === 'none') return
    if (!this.vp) return
    if (intent.type === 'pan') {
      this.setViewport(panBy(this.vp, intent.dx, intent.dy))
      return
    }
    if (intent.type === 'pinch') {
      this.setViewport(panBy(zoomAt(this.vp, intent.factor, intent.x, intent.y), intent.dx, intent.dy))
      return
    }
    if (!this.interactive && !this.play) return
    const pressed = this.pieceAt(intent.pressX, intent.pressY)
    const released = this.pieceAt(intent.x, intent.y)
    if (pressed === null || pressed !== released) return
    this.dispatchEvent(new CustomEvent('piece-click', { detail: { pieceId: pressed }, bubbles: true, composed: true }))
    // Fire and forget: the promise is the animation, and nothing here waits.
    // A rejection (an out-of-range `dir`, a programming error per game.ts)
    // would otherwise vanish as an unhandled rejection; throw it back onto
    // the event loop where a developer, or a test, will see it.
    if (this.play) {
      this.game.click(pressed).catch((e) => {
        queueMicrotask(() => {
          throw e
        })
      })
    }
  }
}

if (!customElements.get('arrowz-board')) customElements.define('arrowz-board', ArrowzBoard)
