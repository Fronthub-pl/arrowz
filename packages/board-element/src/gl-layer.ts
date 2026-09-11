// The board on the GPU. The whole board goes into one static buffer once; a
// pan is two uniforms and six draw calls, so a frame costs what the host has
// pixels and not what the board has pieces. A piece part way down its own
// track is re-tesselated every frame into a second, small buffer, and its
// triangles in the static one are collapsed for as long as it rides.
//
// This file is the layer's life: the context taken, lost, handed back and
// given up, the board and view it draws, and the order of a frame. What a
// frame draws is gl-passes.ts, the GL objects are gl-resources.ts, and a ride
// is rides.ts.
import { voidStrips } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { hueRgba, type Rgba, rgbaOf } from './gl-color.ts'
import { drawDots, drawPaper, drawPieces, drawRiders, drawVoids, setView } from './gl-passes.ts'
import { GlResources } from './gl-resources.ts'
import { Rides } from './rides.ts'
import { type PieceRanges, type Scene, tesselateBoard, voidQuads } from './tesselate.ts'
import { type BoardView, DEFAULT_VIEW } from './view.ts'
import type { Viewport } from './viewport.ts'

export class GlLayer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null = null
  /** Every GL object the layer holds; null exactly when `gl` is, or when making them threw. */
  private res: GlResources | null = null
  /**
   * The extension that gives a context up and asks for it back, kept from
   * before a loss: a lost context grants no extensions, so a layer that only
   * looked for it once the context was gone could never get one.
   */
  private loseExt: WEBGL_lose_context | null = null
  /** True from the browser's lost event until the restore; only then may a context be asked back. */
  private contextLost = false
  /** A restore asked for before the lost event arrived; `onLost` carries it out. */
  private restoreWanted = false
  /** Set by `dispose()` just before it gives the context up, so `onLost` knows the loss was its own. */
  private disposing = false
  /** Called when the browser takes the context away, not when `dispose()` gives it up. */
  onForeignLoss: (() => void) | null = null
  /**
   * Every ride in flight. Its host is arrow functions over the layer's own
   * private members, so none of them becomes a member the element can reach.
   */
  private readonly rides = new Rides({
    board: () => this.current,
    view: () => this.view,
    rangesOf: (id) => this.rangesOf(id),
    setStaticVisible: (id, visible) => this.setStaticVisible(id, visible),
    riderColor: (id, top) => this.riderColor(id, top),
    uploadRiders: () => this.uploadRiders(),
    schedule: () => this.schedule(),
    drop: (id) => this.drop(id),
  })
  /** Pieces that have ridden off for good: collapsed in the buffer, and out of `rangesOf`. */
  private dropped = new Set<number>()
  /** Void strips uploaded for the current board; the browser test asserts the pass exists. */
  private voidStripCount = 0
  private pointsVisible = false
  private pointRadius = 0.1
  private pointRgba: Rgba = [0, 0, 0, 1]
  /** The CSS `pointRgba` was resolved from; `''` is no colour, so the first call always resolves. */
  private pointColor = ''
  private scene: Scene | null = null
  private current: Board | null = null
  private view: BoardView = DEFAULT_VIEW
  private vp: Viewport | null = null
  private padCells = 0
  private pending = 0
  /** How many pieces `scene` actually draws; counted once in `setBoard`, not on every `pieceCount` read. */
  private pieceTotal = 0
  private inkRgba: Rgba = [0, 0, 0, 1]
  private paperRgba: Rgba = [0, 0, 0, 1]
  private highlightRgba: Rgba = [0, 0, 0, 1]
  /** Frames actually drawn; exposed read-only via `drawsForTest`, which the browser tests assert on coalescing with. */
  private frameCount = 0
  /**
   * The resolution the canvas is currently sized for, held as a media query
   * that stops matching the moment `devicePixelRatio` moves. Nothing else the
   * layer watches notices a window dragged onto a Retina display: the host's
   * CSS size does not change, so the element's ResizeObserver never fires,
   * and the board would stay at the old device resolution — visibly blurry —
   * until some interaction happened to ask for a frame. The SVG layer had no
   * such state to go stale.
   */
  private dprQuery: MediaQueryList | null = null

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

  /**
   * Gets the context and makes the `GlResources` every frame needs, whether
   * this is the layer's very first draw or a context handed back after a
   * loss. Both reach it through `onRestored` — the first `restore()` falls
   * through to it — so the two paths cannot drift apart: a change to how the
   * layer starts up is automatically a change to how it comes back.
   */
  private acquire(): void {
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true })
    if (!gl) return
    this.gl = gl
    this.contextLost = false
    this.restoreWanted = false
    // Kept across a loss: the extension object of a live context is what asks
    // for the next one back. A context that never grants it (no such
    // extension) simply cannot be given up early, which costs nothing but the
    // slot a disposed layer would have freed.
    this.loseExt = gl.getExtension('WEBGL_lose_context') ?? this.loseExt
    this.res = GlResources.create(gl)
    gl.enable(gl.BLEND)
    // The drawing buffer is premultiplied — the default of a WebGL2 context,
    // and nothing here asks for otherwise — while every colour reaching a
    // uniform came straight from CSS through `rgbaOf`, with its alpha
    // unmultiplied. Separate factors reconcile the two: the colour channels
    // premultiply the source as they blend it, and the alpha channel
    // accumulates `src.a + dst.a * (1 - src.a)` rather than `src.a * src.a`.
    // The single-factor form got the colour right and the alpha wrong, which
    // looks like nothing in a readback and washes the pixel out on screen:
    // the voids' .22 pass over opaque paper left alpha at .83 instead of 1,
    // and the compositor read the sixth of the pixel that was missing as a
    // hole and let the page through it — the tint the SVG group drew as
    // rgb(243, 207, 222) came out all but white.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.watchDpr()
  }

  /**
   * Watches for the next change of `devicePixelRatio`, replacing whatever was
   * watched before. A media query can only name one resolution, so it has to
   * be re-armed on every change: the query that has just stopped matching
   * would never fire again.
   */
  private watchDpr(): void {
    if (typeof matchMedia !== 'function') return
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
    this.dprQuery.addEventListener('change', this.onDprChange)
  }

  /** Drops the watch, so a disposed layer leaves no listener on the window. */
  private unwatchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = null
  }

  private readonly onDprChange = (): void => {
    this.watchDpr()
    // `resize()` reads the ratio again and re-sizes the drawing buffer; the
    // draw's own uniforms take it from there. All this has to do is ask.
    this.schedule()
  }

  /**
   * A lost context takes every GL object with it. Default-prevented so the
   * browser will offer a restore. Every ride in flight is cancelled through
   * `rides.cancelAll()`, which also writes each rider's piece back to its static,
   * visible shape — moot once the buffer holding it is gone, but it leaves no
   * ride or rider referring to an object that no longer exists.
   */
  private readonly onLost = (e: Event): void => {
    const foreign = !this.disposing
    this.disposing = false
    e.preventDefault()
    if (this.pending !== 0) cancelAnimationFrame(this.pending)
    this.pending = 0
    this.rides.cancelAll()
    this.gl = null
    this.res = null
    this.contextLost = true
    // A restore asked for before the browser had got round to dispatching
    // this event: a context is only restorable once it has been declared
    // lost, so the request waited for here.
    if (this.restoreWanted) {
      this.restoreWanted = false
      this.loseExt?.restoreContext()
    }
    // Someone else's loss: whoever owns the layer decides when to ask back.
    if (foreign) this.onForeignLoss?.()
  }

  /**
   * Everything is rebuilt from state the layer still holds: the board and
   * view `setBoard` last saw, the scene it tesselated from them — omissions
   * and all, which is why the omit set itself need not be kept — the void
   * strips, and the ids in `dropped`. No ride survives a loss (`onLost`
   * cancelled every one of them), so there is nothing in `rides.riders` to
   * re-upload here.
   */
  private readonly onRestored = (): void => {
    this.acquire()
    if (!this.gl) return
    this.upload()
    this.uploadVoids(this.current)
    for (const id of this.dropped) this.setStaticVisible(id, false)
    this.schedule()
  }

  /**
   * False when the browser gave no WebGL2 context at all, and the element
   * shows a message. Also false before the first `restore()`, which is what
   * takes the context, and while a lost one has not come back.
   */
  get supported(): boolean {
    return this.gl !== null
  }

  /**
   * Takes the context for a layer that never had one — synchronously, since
   * there is no loss to wait out — and asks for it back after `dispose()`
   * gave it up, or after a loss the browser has not offered a restore for.
   * A no-op on a live layer.
   *
   * With `WEBGL_lose_context` the context comes back asynchronously, through
   * the same `webglcontextrestored` event a driver reset would use. Without
   * it `dispose()` never gave the context up — it could not — so the canvas
   * still holds a live one, and the layer rebuilds on it here and now rather
   * than waiting for an event no one will dispatch. Either way the board
   * comes back through `onRestored`, from the state the layer still holds
   * rather than from anything the caller has to hand back.
   */
  restore(): void {
    if (this.gl) return
    if (!this.loseExt) {
      // The one case nothing here can undo: a context the driver took away
      // comes back only when the browser offers it, and without the extension
      // there is nothing to ask with. A disposed context was never taken.
      if (!this.contextLost) this.onRestored()
      return
    }
    if (this.contextLost) this.loseExt.restoreContext()
    else this.restoreWanted = true
  }

  get board(): Board | null {
    return this.current
  }

  get pieceCount(): number {
    return this.pieceTotal
  }

  get drawsForTest(): number {
    return this.frameCount
  }

  /** Whether the diagnostic colour buffer exists at all; spec §8 says a monochrome board allocates none. */
  get hasColorsForTest(): boolean {
    return this.res?.hasColors ?? false
  }

  /** How many void strips the current board uploaded; the browser test asserts the pass exists. */
  get voidCountForTest(): number {
    return this.voidStripCount
  }

  hasPiece(id: number): boolean {
    return this.rangesOf(id) !== null
  }

  /** Where a piece's triangles are, or null once it has ridden off for good. */
  private rangesOf(id: number): PieceRanges | null {
    if (this.dropped.has(id)) return null
    return this.scene?.rangeOf(id) ?? null
  }

  get pad(): number {
    return this.padCells
  }

  set pad(cells: number) {
    if (cells === this.padCells) return
    this.padCells = cells
    this.schedule()
  }

  setBoard(board: Board | null, view: BoardView, omit: ReadonlySet<number> = new Set()): void {
    // A new scene has new ranges, so a ride from the old one has nothing left
    // to write its piece back into: every ride stops here, the way the SVG
    // layer's own rebuild stops the animations it finds running.
    this.rides.cancelAll()
    this.view = view
    this.current = board
    this.dropped.clear()
    this.scene = board === null ? null : tesselateBoard(board, view, omit)
    this.pieceTotal = this.scene?.drawnIds().length ?? 0
    this.inkRgba = rgbaOf(view.ink)
    this.paperRgba = rgbaOf(view.paper)
    this.highlightRgba = rgbaOf(view.highlight)
    this.upload()
    this.uploadVoids(board)
    this.schedule()
  }

  setViewport(v: Viewport): void {
    this.vp = v
    this.schedule()
  }

  /**
   * Shows or hides the point grid and sets its colour and radius (in cells).
   * Touches no piece geometry: the grid is a shader over one quad, so toggling
   * it never rebuilds anything (these three are deliberately not in BoardView).
   * The colour is resolved here, once, rather than in the draw loop — the
   * same rule `setBoard` follows for `inkRgba`, `paperRgba` and `highlightRgba`.
   *
   * Settings that have not moved return before either. The element re-states
   * all three on every viewport change, because only it knows whether
   * `cellPx` has crossed MIN_POINT_CELL_PX, so without this guard `rgbaOf` —
   * a `getImageData` readback — would run on every frame of a pan, which is
   * the one thing the resolved-in-the-setters rule exists to stop. The
   * `schedule()` costs as much again: a resize that changes nothing still
   * reaches here, and would ask for a frame behind the element's own guard
   * against exactly that.
   */
  setPoints(visible: boolean, color: string, radius: number): void {
    if (visible === this.pointsVisible && color === this.pointColor && radius === this.pointRadius) return
    this.pointsVisible = visible
    this.pointColor = color
    this.pointRgba = rgbaOf(color)
    this.pointRadius = radius
    this.schedule()
  }

  /** True only while an exit is in flight; a piece that shakes is not leaving. */
  isExiting(id: number): boolean {
    return this.rides.isExiting(id)
  }

  /** Rides the piece off the board head first and drops it; see `Rides.animateExit`. */
  animateExit(id: number, dir: number): Promise<void> {
    return this.rides.animateExit(id, dir)
  }

  /** Nudges the piece `distance` cells down its own track and back. */
  shake(id: number, distance: number): Promise<void> {
    return this.rides.shake(id, distance)
  }

  /** Takes a piece off for good: its triangles stay collapsed and its range goes. */
  private drop(id: number): void {
    if (!this.scene || this.dropped.has(id)) return
    this.setStaticVisible(id, false)
    this.dropped.add(id)
    this.pieceTotal--
    this.schedule()
  }

  /** The colour a rider takes: the rule of the static passes, for one piece. */
  private riderColor(id: number, top: boolean): Rgba {
    if (top) return this.highlightRgba
    return this.view.colored ? hueRgba(id) : this.inkRgba
  }

  /**
   * Collapses a piece's triangles in the static buffer, or writes them back.
   * A collapsed triangle has all three vertices at the origin, so it covers no
   * fragment at all — the piece goes without the board being re-tesselated,
   * which is the whole point of the range map.
   */
  private setStaticVisible(id: number, visible: boolean): void {
    const scene = this.scene
    // Only a piece still on the board is written back, while collapsing reads
    // the raw range: `drop` collapses a piece on its way to taking its range
    // away, and a dropped piece must never come back.
    const r = visible ? this.rangesOf(id) : (scene?.rangeOf(id) ?? null)
    if (!scene || !r || !this.res) return
    this.res.writeRange(scene, r, visible)
  }

  /** Every rider's triangles into the rider buffer; see `GlResources.uploadRiders`. */
  private uploadRiders(): void {
    this.res?.uploadRiders(this.rides.riders)
  }

  /** The scene into the static buffers; see `GlResources.upload`. */
  private upload(): void {
    this.res?.upload(this.scene, this.view.colored)
  }

  /**
   * Tesselates the cells the generator failed to carve into quads, once per
   * board — the strips are static, so re-tesselating them every frame (as a
   * pan or a colour change would otherwise demand) would cost what redrawing
   * the whole board costs, for a pass that never moves.
   */
  private uploadVoids(board: Board | null): void {
    const res = this.res
    if (!res) return
    const strips = board !== null && this.view.voids ? voidStrips(board) : []
    this.voidStripCount = strips.length
    res.uploadVoids(voidQuads(strips))
  }

  /** Coalesces every change inside one frame into one draw. */
  private schedule(): void {
    if (this.pending !== 0 || !this.gl) return
    this.pending = requestAnimationFrame(() => {
      this.pending = 0
      this.draw()
    })
  }

  /**
   * Sizes the drawing buffer to the host, in device pixels. Returns false
   * when the host has no laid-out size yet: before layout, `clientWidth`/
   * `clientHeight` read 0, and drawing would otherwise commit the buffer to
   * 1x1 and never revisit it, because nothing else re-checks the size. The
   * caller skips the frame instead; the next `schedule()`, once whatever
   * triggers it happens after layout, tries again.
   */
  private resize(): boolean {
    const gl = this.gl
    if (!gl) return false
    const dpr = devicePixelRatio
    const w = Math.round(this.canvas.clientWidth * dpr)
    const h = Math.round(this.canvas.clientHeight * dpr)
    if (w <= 0 || h <= 0) return false
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    return true
  }

  /** One frame: the passes of `gl-passes.ts`, in the order they have always run. */
  private draw(): void {
    const gl = this.gl
    const res = this.res
    if (!gl || !res) return
    if (!this.resize()) return
    this.frameCount++
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const vp = this.vp
    const scene = this.scene
    const board = this.current
    if (!vp || !board) return
    const { width, height } = this.canvas

    gl.useProgram(res.program)
    setView(gl, res.program, vp, width, height)
    drawPaper(res, board, this.padCells, this.paperRgba)
    drawDots(res, board, vp, width, height, {
      visible: this.pointsVisible,
      rgba: this.pointRgba,
      radius: this.pointRadius,
    })
    drawVoids(res, this.highlightRgba)
    if (!scene) return
    drawPieces(res, scene, this.view.colored && res.colorBuffer !== null, this.inkRgba, this.highlightRgba)
    drawRiders(res, this.rides.riders, vp, board, this.padCells, height)
  }

  /**
   * Draws now, on this task, instead of on the next frame. Only the browser
   * tests need it: readPixels sees the drawing buffer before compositing
   * clears it, but only within the task that drew, and the layer otherwise
   * always defers to requestAnimationFrame.
   */
  drawNowForTest(): void {
    if (this.pending !== 0) cancelAnimationFrame(this.pending)
    this.pending = 0
    this.draw()
  }

  /**
   * Hands everything back: the GL objects, and then the context itself.
   *
   * The context matters more than the objects. A page is allowed something
   * like sixteen live ones, and the browser takes the oldest away to make
   * room for a new one, so a layer that only deleted its buffers would still
   * cost some other board its picture. Giving it up is what
   * `WEBGL_lose_context.loseContext()` is for.
   *
   * On a browser that grants no such extension the context cannot be given up
   * at all, and only the objects go — which is a rebuild, not a death: there
   * is no loss for the browser to offer a restore for, so `restore()` takes
   * the context the canvas still holds back in place instead of waiting.
   *
   * The two canvas listeners stay: they are the layer's own way back, and
   * `restore()` leans on them. `onLost` will run once the browser dispatches
   * the loss, and finds nothing left to tear down. The resolution watch does
   * not stay — nothing is going to redraw at the new ratio meanwhile, and a
   * listener on the window would outlive the board that wanted it.
   */
  dispose(): void {
    // Every ride stops first: one left running would keep asking for frames on
    // a layer that has already handed its buffers back.
    this.rides.cancelAll()
    if (this.pending !== 0) cancelAnimationFrame(this.pending)
    this.pending = 0
    this.unwatchDpr()
    const gl = this.gl
    this.res?.delete()
    this.res = null
    this.gl = null
    if (gl && !gl.isContextLost() && this.loseExt) {
      this.disposing = true
      this.loseExt.loseContext()
    }
  }
}
