// The board on the GPU. The whole board goes into one static buffer once; a
// pan is two uniforms and six draw calls, so a frame costs what the host has
// pixels and not what the board has pieces. A piece part way down its own
// track is re-tesselated every frame into a second, small buffer, and its
// triangles in the static one are collapsed for as long as it rides.
import { voidStrips } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { hueRgba, type Rgba, rgbaOf } from './gl-color.ts'
import { DOT_FRAG, DOT_VERT, FRAG, link, VERT } from './gl-shaders.ts'
import { Rides } from './rides.ts'
import { type Block, type PieceRanges, type Scene, tesselateBoard, tesselateColors, voidQuads } from './tesselate.ts'
import { type BoardView, DEFAULT_VIEW } from './view.ts'
import { MIN_POINT_CELL_PX, type Viewport } from './viewport.ts'

/** The blocks in draw order, with where each takes its colour from. */
const PASSES: readonly { block: Block; highlight: boolean }[] = [
  { block: 'lines', highlight: false },
  { block: 'topLines', highlight: true },
  { block: 'heads', highlight: false },
  { block: 'topHeads', highlight: true },
]

export class GlLayer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private dotProgram: WebGLProgram | null = null
  private posBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null
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
  /**
   * Scratch storage for whatever single quad the current pass is drawing —
   * the paper's, then the dot grid's. Each pass re-uploads its own quad into
   * it with `bufferData` before drawing, so its contents are never valid
   * across passes: a pass added later must not assume what it holds coming
   * in, only what it writes itself.
   */
  private quadBuffer: WebGLBuffer | null = null
  /** The riders' own buffer, rewritten whole every frame one of them moves. */
  private rideBuffer: WebGLBuffer | null = null
  /** Every rider's triangles back to back, for one upload; grown, never rebuilt per frame. */
  private rideScratch = new Float32Array(0)
  /** Pieces that have ridden off for good: collapsed in the buffer, and out of `rangesOf`. */
  private dropped = new Set<number>()
  private voidBuffer: WebGLBuffer | null = null
  private voidVertices = 0
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
   * Gets the context and builds both programs and the two buffers every
   * frame needs, whether this is the layer's very first draw or a context
   * handed back after a loss. Both reach it through `onRestored` — the first
   * `restore()` falls through to it — so the two paths cannot drift apart: a
   * change to how the layer starts up is automatically a change to how it
   * comes back.
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
    this.program = link(gl, VERT, FRAG)
    this.dotProgram = link(gl, DOT_VERT, DOT_FRAG)
    this.posBuffer = gl.createBuffer()
    this.quadBuffer = gl.createBuffer()
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
    this.program = null
    this.dotProgram = null
    this.posBuffer = null
    this.colorBuffer = null
    this.quadBuffer = null
    this.voidBuffer = null
    this.rideBuffer = null
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
    return this.colorBuffer !== null
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
    const gl = this.gl, scene = this.scene
    // Only a piece still on the board is written back, while collapsing reads
    // the raw range: `drop` collapses a piece on its way to taking its range
    // away, and a dropped piece must never come back.
    const r = visible ? this.rangesOf(id) : (scene?.rangeOf(id) ?? null)
    if (!gl || !scene || !r || !this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    for (const range of [r.line, r.head]) {
      if (range.count === 0) continue
      const slice = visible
        ? scene.positions.subarray(range.start * 2, (range.start + range.count) * 2)
        : new Float32Array(range.count * 2)
      gl.bufferSubData(gl.ARRAY_BUFFER, range.start * 2 * Float32Array.BYTES_PER_ELEMENT, slice)
    }
  }

  /**
   * Every rider's triangles into the rider buffer, back to back, and each
   * rider's own slice of it recorded. One upload for all of them rather than
   * one buffer per ride: two pieces can be riding at once — two quick clicks
   * are enough — and a buffer holding only whichever uploaded last would drop
   * the other one for the frame.
   */
  private uploadRiders(): void {
    const gl = this.gl
    if (!gl) return
    let total = 0
    for (const r of this.rides.riders.values()) total += r.count
    if (total === 0) return
    if (this.rideScratch.length < total * 2) this.rideScratch = new Float32Array(total * 2)
    let at = 0
    for (const r of this.rides.riders.values()) {
      r.start = at
      this.rideScratch.set(r.data.subarray(0, r.count * 2), at * 2)
      at += r.count
    }
    this.rideBuffer ??= gl.createBuffer()
    if (!this.rideBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rideBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.rideScratch.subarray(0, total * 2), gl.DYNAMIC_DRAW)
  }

  private upload(): void {
    const gl = this.gl
    const scene = this.scene
    if (!gl || !this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, scene?.positions ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    // The colour buffer is the diagnostic mode's alone: a monochrome board
    // takes its colour from a uniform and allocates nothing (spec §8).
    if (scene && this.view.colored) {
      this.colorBuffer ??= gl.createBuffer()
      if (this.colorBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, tesselateColors(scene), gl.STATIC_DRAW)
      }
    }
  }

  /**
   * Tesselates the cells the generator failed to carve into quads, once per
   * board — the strips are static, so re-tesselating them every frame (as a
   * pan or a colour change would otherwise demand) would cost what redrawing
   * the whole board costs, for a pass that never moves.
   */
  private uploadVoids(board: Board | null): void {
    const gl = this.gl
    if (!gl) return
    this.voidBuffer ??= gl.createBuffer()
    const strips = board !== null && this.view.voids ? voidStrips(board) : []
    this.voidStripCount = strips.length
    const data = voidQuads(strips)
    this.voidVertices = strips.length * 6
    if (this.voidBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.voidBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    }
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

  /**
   * Binds `pos` to `a_pos`, and either binds `color` to `a_color` or
   * disables it. Every pass on the main program — the paper and the four
   * piece blocks today, plus the voids — routes through here instead of
   * repeating the six lines by hand, so a pass that would hand a colour
   * buffer sized for a different position buffer has to say so explicitly at
   * its own call site, rather than the mismatch surviving because of the
   * order passes happen to run in.
   *
   * Takes the program explicitly so the dot pass's program — which has no
   * `a_color` at all — can share it too: `getAttribLocation` returns -1 for
   * an attribute a program does not declare, and disabling a negative
   * location is a GL error, so that case is a no-op rather than a call.
   */
  private bindAttrs(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    pos: WebGLBuffer | null,
    color: WebGLBuffer | null,
  ): void {
    const posLoc = gl.getAttribLocation(program, 'a_pos')
    gl.bindBuffer(gl.ARRAY_BUFFER, pos)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    const colorLoc = gl.getAttribLocation(program, 'a_color')
    if (colorLoc === -1) return
    if (color) {
      gl.bindBuffer(gl.ARRAY_BUFFER, color)
      gl.enableVertexAttribArray(colorLoc)
      gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0)
    } else {
      gl.disableVertexAttribArray(colorLoc)
    }
  }

  private draw(): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return
    if (!this.resize()) return
    this.frameCount++
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const vp = this.vp
    const scene = this.scene
    const board = this.current
    if (!vp || !board) return

    gl.useProgram(program)
    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name)
    gl.uniform2f(loc('u_origin'), vp.originX, vp.originY)
    gl.uniform1f(loc('u_scale'), vp.cellPx * devicePixelRatio)
    gl.uniform2f(loc('u_size'), this.canvas.width, this.canvas.height)

    this.drawPaper(gl, program)
    this.drawDots(gl)
    this.drawVoids(gl, program)
    if (!scene) return

    const useAttr = this.view.colored && this.colorBuffer !== null
    this.bindAttrs(gl, program, this.posBuffer, useAttr ? this.colorBuffer : null)

    for (const pass of PASSES) {
      const range = scene.blocks[pass.block]
      if (range.count === 0) continue
      // Highlighted pieces take one flat colour, so the diagnostic hues never
      // reach them — the same rule the SVG group carried on its stroke.
      gl.uniform1i(loc('u_useAttr'), !pass.highlight && useAttr ? 1 : 0)
      gl.uniform4fv(loc('u_flat'), pass.highlight ? this.highlightRgba : this.inkRgba)
      gl.drawArrays(gl.TRIANGLES, range.start, range.count)
    }

    this.drawRiders(gl, program, vp, board)
  }

  /**
   * The pieces part way down their own track, over the resting ones and
   * clipped to the paper. Only a riding piece is clipped: a scissor over the
   * whole board would cost nothing here, but the rule is the SVG's — a piece
   * leaves at the paper's edge, and nothing else ever reaches it.
   */
  private drawRiders(gl: WebGL2RenderingContext, program: WebGLProgram, vp: Viewport, board: Board): void {
    if (this.rides.riders.size === 0 || !this.rideBuffer) return
    const s = vp.cellPx * devicePixelRatio
    const p = this.padCells
    // All four edges are rounded, and the size is taken from the rounded edges
    // rather than rounded on its own: a width rounded apart from its left edge
    // lands the right edge up to a pixel off the paper's, which is a visible
    // slice of a piece appearing or disappearing as it rides out at the edge.
    const left = Math.round((-p - vp.originX) * s)
    const top = Math.round((-p - vp.originY) * s)
    const right = Math.round((board.W + p - vp.originX) * s)
    const bottom = Math.round((board.H + p - vp.originY) * s)
    gl.enable(gl.SCISSOR_TEST)
    // The scissor box counts from the bottom left, the viewport maths from the top.
    gl.scissor(left, this.canvas.height - bottom, right - left, bottom - top)
    this.bindAttrs(gl, program, this.rideBuffer, null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), 0)
    const flat = gl.getUniformLocation(program, 'u_flat')
    for (const r of this.rides.riders.values()) {
      if (r.count === 0) continue
      gl.uniform4fv(flat, r.color)
      gl.drawArrays(gl.TRIANGLES, r.start, r.count)
    }
    gl.disable(gl.SCISSOR_TEST)
  }

  /** The paper: one quad over the cells plus the margin. */
  private drawPaper(gl: WebGL2RenderingContext, program: WebGLProgram): void {
    const board = this.current
    if (!board || !this.quadBuffer) return
    const p = this.padCells
    const x0 = -p, y0 = -p, x1 = board.W + p, y1 = board.H + p
    const quad = new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1])
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
    this.bindAttrs(gl, program, this.quadBuffer, null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), 0)
    gl.uniform4fv(gl.getUniformLocation(program, 'u_flat'), this.paperRgba)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /**
   * The grid over the cells alone: 0,0 to W,H, the margin left blank, shown
   * only once a cell is big enough to hold a dot — below MIN_POINT_CELL_PX a
   * dense raster of dots moirés instead of reading as dots. The element
   * decides that, because only it knows `cellPx`; the pass refuses on its own
   * as well, so a viewport handed straight to the layer cannot get past it.
   */
  private drawDots(gl: WebGL2RenderingContext): void {
    const board = this.current, vp = this.vp, prog = this.dotProgram
    if (!board || !vp || !prog || !this.quadBuffer) return
    if (!this.pointsVisible || vp.cellPx < MIN_POINT_CELL_PX) return
    const quad = new Float32Array([0, 0, board.W, 0, board.W, board.H, 0, 0, board.W, board.H, 0, board.H])
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
    this.bindAttrs(gl, prog, this.quadBuffer, null)
    const scale = vp.cellPx * devicePixelRatio
    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, name)
    gl.uniform2f(loc('u_origin'), vp.originX, vp.originY)
    gl.uniform1f(loc('u_scale'), scale)
    gl.uniform2f(loc('u_size'), this.canvas.width, this.canvas.height)
    gl.uniform4fv(loc('u_dot'), this.pointRgba)
    gl.uniform1f(loc('u_radius'), this.pointRadius)
    gl.uniform1f(loc('u_feather'), 1 / scale)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    // Restores the main program: every pass after this one — the voids and
    // the piece blocks — assumes it is the active program and current.
    gl.useProgram(this.program)
  }

  /** The cells the generator failed to carve, in the highlight colour at .22 opacity — the SVG group's fill-opacity. */
  private drawVoids(gl: WebGL2RenderingContext, program: WebGLProgram): void {
    if (this.voidVertices === 0 || !this.voidBuffer) return
    this.bindAttrs(gl, program, this.voidBuffer, null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), 0)
    const [r, g, b, a] = this.highlightRgba
    gl.uniform4fv(gl.getUniformLocation(program, 'u_flat'), [r, g, b, a * 0.22])
    gl.drawArrays(gl.TRIANGLES, 0, this.voidVertices)
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
    if (gl) {
      if (this.program) gl.deleteProgram(this.program)
      if (this.dotProgram) gl.deleteProgram(this.dotProgram)
      if (this.posBuffer) gl.deleteBuffer(this.posBuffer)
      if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
      if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)
      if (this.rideBuffer) gl.deleteBuffer(this.rideBuffer)
      if (this.voidBuffer) gl.deleteBuffer(this.voidBuffer)
    }
    this.program = null
    this.dotProgram = null
    this.posBuffer = null
    this.colorBuffer = null
    this.quadBuffer = null
    this.rideBuffer = null
    this.voidBuffer = null
    this.gl = null
    if (gl && !gl.isContextLost() && this.loseExt) {
      this.disposing = true
      this.loseExt.loseContext()
    }
  }
}
