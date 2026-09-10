// The board on the GPU. The whole board goes into one static buffer once; a
// pan is two uniforms and six draw calls, so a frame costs what the host has
// pixels and not what the board has pieces. Riding pieces live in a second,
// small buffer (see the ride task).
import type { Board } from '@arrowz/engine'
import { type Block, type PieceRanges, type Scene, tesselateBoard, tesselateColors } from './tesselate.ts'
import { type BoardView, DEFAULT_VIEW } from './view.ts'
import type { Viewport } from './viewport.ts'

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

type Rgba = [number, number, number, number]

/**
 * A CSS colour as GL floats. The browser does the parsing, so anything a
 * consumer may put in `view.ink` works — names, hex of either length, hsl(),
 * the colour functions of tomorrow — without this file owning a parser.
 */
function rgbaOf(css: string): Rgba {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return [0, 0, 0, 1]
  probe.fillStyle = '#000'
  probe.fillStyle = css
  probe.fillRect(0, 0, 1, 1)
  const d = probe.getImageData(0, 0, 1, 1).data
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
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`gl-layer: ${gl.getProgramInfoLog(p) ?? 'program did not link'}`)
  }
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
  private posBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null
  private quadBuffer: WebGLBuffer | null = null
  private scene: Scene | null = null
  private current: Board | null = null
  private view: BoardView = DEFAULT_VIEW
  private omit: ReadonlySet<number> = new Set()
  private vp: Viewport | null = null
  private padCells = 0
  private pending = 0
  /** Frames actually drawn; the browser tests assert on coalescing with it. */
  drawsForTest = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true })
    if (!gl) return
    this.gl = gl
    this.program = link(gl, VERT, FRAG)
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
    return this.scene?.drawnIds().length ?? 0
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
    this.upload()
    this.schedule()
  }

  setViewport(v: Viewport): void {
    this.vp = v
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

  /** Coalesces every change inside one frame into one draw. */
  private schedule(): void {
    if (this.pending !== 0 || !this.gl) return
    this.pending = requestAnimationFrame(() => {
      this.pending = 0
      this.draw()
    })
  }

  private resize(): void {
    const gl = this.gl
    if (!gl) return
    const dpr = devicePixelRatio
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  private draw(): void {
    const gl = this.gl
    if (!gl || !this.program) return
    this.resize()
    this.drawsForTest++
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const vp = this.vp
    const scene = this.scene
    const board = this.current
    if (!vp || !board) return

    const program = this.program
    gl.useProgram(program)
    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name)
    gl.uniform2f(loc('u_origin'), vp.originX, vp.originY)
    gl.uniform1f(loc('u_scale'), vp.cellPx * devicePixelRatio)
    gl.uniform2f(loc('u_size'), this.canvas.width, this.canvas.height)

    this.drawPaper(gl)
    if (!scene) return

    const posLoc = gl.getAttribLocation(this.program, 'a_pos')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const colorLoc = gl.getAttribLocation(this.program, 'a_color')
    const useAttr = this.view.colored && this.colorBuffer !== null
    if (useAttr && this.colorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
      gl.enableVertexAttribArray(colorLoc)
      gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0)
    } else {
      gl.disableVertexAttribArray(colorLoc)
    }

    const ink = rgbaOf(this.view.ink)
    const highlight = rgbaOf(this.view.highlight)
    for (const pass of PASSES) {
      const range = scene.blocks[pass.block]
      if (range.count === 0) continue
      // Highlighted pieces take one flat colour, so the diagnostic hues never
      // reach them — the same rule the SVG group carried on its stroke.
      gl.uniform1i(loc('u_useAttr'), !pass.highlight && useAttr ? 1 : 0)
      gl.uniform4fv(loc('u_flat'), pass.highlight ? highlight : ink)
      gl.drawArrays(gl.TRIANGLES, range.start, range.count)
    }
  }

  /** The paper: one quad over the cells plus the margin. */
  private drawPaper(gl: WebGL2RenderingContext): void {
    const board = this.current
    if (!board || !this.program || !this.quadBuffer) return
    const p = this.padCells
    const x0 = -p, y0 = -p, x1 = board.W + p, y1 = board.H + p
    const quad = new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1])
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
    const posLoc = gl.getAttribLocation(this.program, 'a_pos')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.disableVertexAttribArray(gl.getAttribLocation(this.program, 'a_color'))
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_useAttr'), 0)
    gl.uniform4fv(gl.getUniformLocation(this.program, 'u_flat'), rgbaOf(this.view.paper))
    gl.drawArrays(gl.TRIANGLES, 0, 6)
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
  }
}
