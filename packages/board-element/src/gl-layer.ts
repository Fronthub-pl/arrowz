// The board on the GPU. The whole board goes into one static buffer once; a
// pan is two uniforms and six draw calls, so a frame costs what the host has
// pixels and not what the board has pieces. Riding pieces live in a second,
// small buffer (see the ride task).
import { voidStrips } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { type Block, type PieceRanges, type Scene, tesselateBoard, tesselateColors } from './tesselate.ts'
import { type BoardView, DEFAULT_VIEW } from './view.ts'
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
   * Scratch storage for whatever single quad the current pass is drawing —
   * the paper's, then the dot grid's. Each pass re-uploads its own quad into
   * it with `bufferData` before drawing, so its contents are never valid
   * across passes: a pass added later must not assume what it holds coming
   * in, only what it writes itself.
   */
  private quadBuffer: WebGLBuffer | null = null
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
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true })
    if (!gl) return
    this.gl = gl
    this.program = link(gl, VERT, FRAG)
    this.dotProgram = link(gl, DOT_VERT, DOT_FRAG)
    this.posBuffer = gl.createBuffer()
    this.quadBuffer = gl.createBuffer()
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  /** False when the browser gave no WebGL2 context at all; the element shows a message. */
  get supported(): boolean {
    return this.gl !== null
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

  /** How many void strips the current board uploaded; the browser test asserts the pass exists. */
  get voidCountForTest(): number {
    return this.voidStripCount
  }

  hasPiece(id: number): boolean {
    return this.rangesOf(id) !== null
  }

  private rangesOf(id: number): PieceRanges | null {
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
    this.view = view
    this.omit = omit
    this.current = board
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
   * dense raster of dots moirés instead of reading as dots, the same rule
   * `SvgLayer.setPoints` follows by never mounting its pattern rect.
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

  dispose(): void {
    if (this.pending !== 0) cancelAnimationFrame(this.pending)
    this.pending = 0
    const gl = this.gl
    if (gl) {
      if (this.program) gl.deleteProgram(this.program)
      if (this.dotProgram) gl.deleteProgram(this.dotProgram)
      if (this.posBuffer) gl.deleteBuffer(this.posBuffer)
      if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
      if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)
      if (this.voidBuffer) gl.deleteBuffer(this.voidBuffer)
    }
    this.program = null
    this.dotProgram = null
    this.posBuffer = null
    this.colorBuffer = null
    this.quadBuffer = null
    this.voidBuffer = null
    this.gl = null
  }
}
