// The board on the GPU. The whole board goes into one static buffer once; a
// pan is two uniforms and six draw calls, so a frame costs what the host has
// pixels and not what the board has pieces. A piece part way down its own
// track is re-tesselated every frame into a second, small buffer, and its
// triangles in the static one are collapsed for as long as it rides.
import { voidStrips } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { exitDistance, exitMs, shakeShift } from './track.ts'
import {
  type Block,
  frontOf,
  type PieceRanges,
  type Ride,
  rideVertexBound,
  type Scene,
  tesselateBoard,
  tesselateColors,
  tesselatePiece,
} from './tesselate.ts'
import { type BoardView, DEFAULT_VIEW, hueBytes, SHAKE_MS } from './view.ts'
import { MIN_POINT_CELL_PX, type Viewport } from './viewport.ts'

const VERT = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_size;
uniform vec4 u_flat;
uniform bool u_useAttr;
out vec4 v_color;
void main() {
  vec2 px = (a_pos - u_origin) * u_scale;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
  v_color = u_useAttr ? a_color : u_flat;
}`

const FRAG = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 color;
void main() { color = v_color; }`

// The dot grid's own program: its fragment shader is the pattern the SVG
// layer tiles as a one-cell <pattern> holding one circle, expressed with no
// geometry at all — one quad over the cells, coloured per fragment.
const DOT_VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_size;
out vec2 v_world;
void main() {
  v_world = a_pos;
  vec2 px = (a_pos - u_origin) * u_scale;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
}`

// One dot per cell, at the cell's centre. u_feather is one device pixel in
// cells, so the edge is antialiased at any zoom.
const DOT_FRAG = `#version 300 es
precision mediump float;
in vec2 v_world;
uniform vec4 u_dot;
uniform float u_radius;
uniform float u_feather;
out vec4 color;
void main() {
  float d = length(fract(v_world) - 0.5);
  float a = 1.0 - smoothstep(u_radius - u_feather, u_radius + u_feather, d);
  if (a <= 0.0) discard;
  color = vec4(u_dot.rgb, u_dot.a * a);
}`

type Rgba = [number, number, number, number]

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A piece part way down its own track: its triangles in cells, how many of
 * them are live, where they sit in the rider buffer, and the colour they take.
 * `data` is allocated to `rideVertexBound(piece)` once, at the ride's start,
 * so a frame of a ride allocates nothing.
 */
interface Rider {
  data: Float32Array
  count: number
  /** Where its vertices begin in the rider buffer; `uploadRiders` owns this. */
  start: number
  color: Rgba
}

/** A piece's diagnostic hue as GL floats, without going through CSS and a canvas. */
function hueRgba(id: number): Rgba {
  const [r, g, b] = hueBytes(id)
  return [r / 255, g / 255, b / 255, 1]
}

/**
 * A single 2D context, reused by every `rgbaOf` call rather than one canvas
 * created per call. Lazy so importing this module never touches the DOM.
 */
let probeCtx: CanvasRenderingContext2D | null | undefined

function probe(): CanvasRenderingContext2D | null {
  if (probeCtx === undefined) probeCtx = document.createElement('canvas').getContext('2d')
  return probeCtx
}

/**
 * A CSS colour as GL floats. The browser does the parsing, so anything a
 * consumer may put in `view.ink` works — names, hex of either length, hsl(),
 * the colour functions of tomorrow — without this file owning a parser.
 *
 * Resolved once per `BoardView`, in `setBoard` (and per point colour, in
 * `setPoints`) — never from the draw loop. `draw()` runs up to three colours
 * a frame, and each call here is a canvas readback; paid once per board or
 * view change, it is free, paid sixty times a second it is not.
 */
function rgbaOf(css: string): Rgba {
  const ctx = probe()
  if (!ctx) return [0, 0, 0, 1]
  // The one pixel is cleared first: `fillRect` composites, so a half
  // transparent colour would otherwise be read over whatever the previous
  // call left there and come back opaque.
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  const [r, g, b, a] = [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 255]
  return [r / 255, g / 255, b / 255, a / 255]
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('gl-layer: createShader failed')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`gl-layer: ${gl.getShaderInfoLog(sh) ?? 'shader did not compile'}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()
  if (!p) throw new Error('gl-layer: createProgram failed')
  const vs = compile(gl, gl.VERTEX_SHADER, vert)
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag)
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS)
  const log = gl.getProgramInfoLog(p)
  // Once a program is linked, its shaders can be released immediately — the
  // normal WebGL idiom, and it keeps the constructor from leaking two shader
  // objects per layer.
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!ok) throw new Error(`gl-layer: ${log ?? 'program did not link'}`)
  return p
}

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
  /** The pieces part way down their own track, by id. */
  private riders = new Map<number, Rider>()
  /** The animations of every ride in flight, by piece id. */
  private running = new Map<number, Animation[]>()
  /** The animations of the exits in flight; what `isExiting` answers from. */
  private exiting = new Map<number, Animation[]>()
  /** Pieces that have ridden off for good: collapsed in the buffer, and out of `rangesOf`. */
  private dropped = new Set<number>()
  private voidBuffer: WebGLBuffer | null = null
  private voidVertices = 0
  /** Void strips uploaded for the current board; the browser test asserts the pass exists. */
  private voidStripCount = 0
  private pointsVisible = false
  private pointRadius = 0.1
  private pointRgba: Rgba = [0, 0, 0, 1]
  private scene: Scene | null = null
  private current: Board | null = null
  private view: BoardView = DEFAULT_VIEW
  private omit: ReadonlySet<number> = new Set()
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

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.addEventListener('webglcontextlost', this.onLost)
    this.canvas.addEventListener('webglcontextrestored', this.onRestored)
    this.acquire()
  }

  /**
   * Gets the context and builds both programs and the two buffers every
   * frame needs, whether this is the layer's very first draw or a context
   * handed back after a loss. Shared by the constructor and `onRestored` so
   * the two paths cannot drift apart: a change to how the layer starts up is
   * automatically a change to how it comes back.
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  /**
   * A lost context takes every GL object with it. Default-prevented so the
   * browser will offer a restore. Every ride in flight is cancelled through
   * `cancelAll`, which also writes each rider's piece back to its static,
   * visible shape — moot once the buffer holding it is gone, but it leaves no
   * ride or rider referring to an object that no longer exists.
   */
  private readonly onLost = (e: Event): void => {
    e.preventDefault()
    if (this.pending !== 0) cancelAnimationFrame(this.pending)
    this.pending = 0
    this.cancelAll()
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
  }

  /**
   * Everything is rebuilt from state the layer still holds: the board and
   * view `setBoard` last saw, the omissions, the void strips, and the ids in
   * `dropped`. No ride survives a loss (`onLost` cancelled every one of
   * them), so there is nothing in `riders` to re-upload here.
   */
  private readonly onRestored = (): void => {
    this.acquire()
    if (!this.gl) return
    this.upload()
    this.uploadVoids(this.current)
    for (const id of this.dropped) this.setStaticVisible(id, false)
    this.schedule()
  }

  /** False when the browser gave no WebGL2 context at all; the element shows a message. */
  get supported(): boolean {
    return this.gl !== null
  }

  /**
   * Asks for the context back after `dispose()` gave it up, or after a loss
   * the browser has not offered a restore for. A no-op on a live layer and on
   * one that never had a context at all.
   *
   * The context comes back asynchronously, through the same
   * `webglcontextrestored` event a driver reset would use, so the board is
   * rebuilt by `onRestored` from the state the layer still holds rather than
   * by anything the caller has to hand back.
   */
  restore(): void {
    if (this.gl || !this.loseExt) return
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
    this.cancelAll()
    this.view = view
    this.omit = omit
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
   */
  setPoints(visible: boolean, color: string, radius: number): void {
    this.pointsVisible = visible
    this.pointRgba = rgbaOf(color)
    this.pointRadius = radius
    this.schedule()
  }

  /** True only while an exit is in flight; a piece that shakes is not leaving. */
  isExiting(id: number): boolean {
    return this.exiting.has(id)
  }

  /**
   * Rides the piece off the board head first and drops it. The head runs
   * straight out along `dir`, every other cell passes through the place of the
   * one ahead of it, and the ride is long enough for the tail to clear the
   * edge too. Resolves when the ride ends: if it finished, the piece is gone
   * for good, and if it was superseded, the piece belongs to whatever
   * superseded it.
   */
  animateExit(id: number, dir: number): Promise<void> {
    const board = this.current
    const piece = this.pieceOf(id)
    if (!board || !piece) return Promise.resolve()
    // Resolved before anything is marked or cancelled: a bad `dir` throws here
    // and leaves the piece exactly as it was.
    const distance = exitDistance(piece.cells, dir, board.W, board.H)
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : exitMs(distance)
    const { anims, done } = this.ride(id, piece, dir, duration, (p) => p * distance)
    this.exiting.set(id, anims)
    return done.then((finished) => {
      if (finished) this.drop(id)
    }).finally(() => {
      // Only the exit that owns the mark may clear it: a superseding exit has
      // already replaced the entry, and its piece is still on its way out.
      if (this.exiting.get(id) === anims) this.exiting.delete(id)
    })
  }

  /** Nudges the piece `distance` cells down its own track and back. */
  shake(id: number, distance: number): Promise<void> {
    const piece = this.pieceOf(id)
    if (!piece) return Promise.resolve()
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : SHAKE_MS
    return this.ride(id, piece, piece.dir, duration, (p) => shakeShift(p, distance)).done.then(() => undefined)
  }

  /**
   * The piece behind an id, or null when the board never drew it or it has
   * ridden off. One scan of the pieces per ride, never per frame: the scene
   * knows where a piece's triangles are but not the cells they came from.
   */
  private pieceOf(id: number): Piece | null {
    if (!this.rangesOf(id)) return null
    return this.current?.pieces.find((p) => p.id === id) ?? null
  }

  /**
   * Drives the piece down its own track, `shift(progress)` cells at a time,
   * and registers the ride so a later one can cancel it.
   *
   * The clock is a Web Animation over nothing at all: it gives the ride a
   * `finished` promise and a `cancel()`, so everything built on those keeps
   * working, while the drawing happens per frame. It has to, because a piece
   * on a bent track does not move as one — its line bends through the corners
   * while the head runs straight out — and no interpolated transform can do
   * that. Head, line and tail come out of one `tesselatePiece` call, so they
   * cannot drift apart.
   */
  private ride(
    id: number,
    piece: Piece,
    dir: number,
    duration: number,
    shift: (p: number) => number,
  ): { anims: Animation[]; done: Promise<boolean> } {
    const ranges = this.rangesOf(id)
    if (!ranges) return { anims: [], done: Promise.resolve(false) }
    const top = ranges.top
    const front = frontOf(piece, this.view, top, dir)
    const bound = rideVertexBound(piece)
    const rider: Rider = { data: new Float32Array(bound * 2), count: 0, start: 0, color: this.riderColor(id, top) }
    // The rider takes the piece over from here: the static buffer holds its
    // collapsed triangles until the ride is cancelled, or for good if it ends
    // anywhere but where it started.
    this.setStaticVisible(id, false)
    this.riders.set(id, rider)

    const draw = (shifted: number): void => {
      const track: Ride = { dir, front, shift: shifted }
      const count = tesselatePiece(piece, this.view, top, track, rider.data)
      // `rider.data` is exactly `rideVertexBound(piece)` long, and a write past
      // the end of a typed array is dropped rather than raised: the bound holds
      // (tesselate.test.ts pins it), and if it ever stopped holding, the piece
      // would come out silently truncated instead of loudly wrong. This runs
      // inside the frame callback, so it does not reject the ride's promise —
      // it lands where an unhandled error lands, which is enough to see it,
      // and the only place the count exists to be checked at all.
      if (count > bound) throw new Error(`gl-layer: piece ${id} rode past its ${bound}-vertex bound`)
      rider.count = count
      this.uploadRiders()
      this.schedule()
    }

    const clock = new Animation(new KeyframeEffect(null, null, { duration, fill: 'forwards' }), document.timeline)
    const anims = [clock]
    const tick = (): void => {
      // Cancelled rides stop here; the last frame of a finished one is not
      // drawn by the loop but by `done`, so that a caller awaiting the ride
      // never sees the piece a frame short of where the ride leaves it.
      if (clock.playState !== 'running') return
      const p = clock.effect?.getComputedTiming().progress
      draw(shift(typeof p === 'number' ? p : 0))
      requestAnimationFrame(tick)
    }
    this.running.set(id, anims)
    clock.play()
    requestAnimationFrame(tick)
    const done = this.settle(id, anims).then((finished) => {
      // A superseding ride has already put this rider away and installed its
      // own; this one must touch neither it nor the piece it now owns.
      if (this.riders.get(id) !== rider) return finished
      this.riders.delete(id)
      // A ride that ends where it started is put back rather than drawn there,
      // so rounding cannot leave the piece a hair off its resting shape. One
      // that ends anywhere else leaves it collapsed, for its caller to drop.
      if (finished && shift(1) === 0) this.setStaticVisible(id, true)
      this.uploadRiders()
      this.schedule()
      return finished
    })
    return { anims, done }
  }

  /** Resolves true when every animation finished, false when one was cancelled. */
  private settle(id: number, anims: Animation[]): Promise<boolean> {
    return Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (this.running.get(id) === anims) this.running.delete(id)
        return true
      },
      () => false,
    )
  }

  /**
   * Stops the ride of a piece and writes its triangles back into the static
   * buffer at once. Here and not in the cancelled ride's own settling, which
   * cannot know whether the piece is wanted back: a superseding ride collapses
   * it again on the very next line, while a `setBoard` or a `dispose` has no
   * next ride to draw it, and the piece would be gone from the board for as
   * long as it stayed.
   */
  private cancelRunning(id: number): void {
    const anims = this.running.get(id)
    this.running.delete(id)
    if (anims) { for (const a of anims) a.cancel() }
    if (this.riders.delete(id)) this.uploadRiders()
    this.setStaticVisible(id, true)
  }

  /** Stops every ride in flight, each piece back where it was. */
  private cancelAll(): void {
    for (const id of [...this.running.keys()]) this.cancelRunning(id)
    // A ride whose clock has settled but whose promise chain has not run yet
    // has left `running` and still holds its rider, so the loop above misses
    // it. Its piece is written back here rather than dropped: what is thrown
    // away is the rider, and the static buffer is all that would be left to
    // draw the piece.
    for (const id of [...this.riders.keys()]) this.setStaticVisible(id, true)
    this.riders.clear()
    this.exiting.clear()
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
    for (const r of this.riders.values()) total += r.count
    if (total === 0) return
    if (this.rideScratch.length < total * 2) this.rideScratch = new Float32Array(total * 2)
    let at = 0
    for (const r of this.riders.values()) {
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
    const data = new Float32Array(strips.length * 12)
    let o = 0
    for (const s of strips) {
      const x0 = s.x, y0 = s.y, x1 = s.x + s.len, y1 = s.y + 1
      data[o++] = x0
      data[o++] = y0
      data[o++] = x1
      data[o++] = y0
      data[o++] = x1
      data[o++] = y1
      data[o++] = x0
      data[o++] = y0
      data[o++] = x1
      data[o++] = y1
      data[o++] = x0
      data[o++] = y1
    }
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
    if (this.riders.size === 0 || !this.rideBuffer) return
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
    for (const r of this.riders.values()) {
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
   * The two canvas listeners stay: they are the layer's own way back, and
   * `restore()` leans on them. `onLost` will run once the browser dispatches
   * the loss, and finds nothing left to tear down.
   */
  dispose(): void {
    // Every ride stops first: one left running would keep asking for frames on
    // a layer that has already handed its buffers back.
    this.cancelAll()
    if (this.pending !== 0) cancelAnimationFrame(this.pending)
    this.pending = 0
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
    if (gl && !gl.isContextLost()) this.loseExt?.loseContext()
  }
}
