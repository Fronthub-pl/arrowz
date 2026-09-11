// Every GL object the layer makes, and every write into one. An instance
// lives exactly as long as the context it was made on: a loss drops the whole
// object and a restore makes a new one, so what the layer holds on the GPU is
// listed once, here, rather than once each for taking, losing and handing
// back a context. The lazy fields below are written only by this class; the
// passes read them.
import { DOT_FRAG, DOT_VERT, FRAG, link, VERT } from './gl-shaders.ts'
import type { Rider } from './rides.ts'
import { type PieceRanges, type Scene, tesselateColors } from './tesselate.ts'

export class GlResources {
  readonly gl: WebGL2RenderingContext
  readonly program: WebGLProgram
  readonly dotProgram: WebGLProgram
  /** The whole board's triangles, in cells. */
  readonly posBuffer: WebGLBuffer | null
  /**
   * Scratch storage for whatever single quad the current pass is drawing —
   * the paper's, then the dot grid's. Each pass re-uploads its own quad into
   * it with `bufferData` before drawing, so its contents are never valid
   * across passes: a pass added later must not assume what it holds coming
   * in, only what it writes itself.
   */
  readonly quadBuffer: WebGLBuffer | null
  /** The diagnostic mode's per-vertex colours; a monochrome board never creates it. */
  colorBuffer: WebGLBuffer | null = null
  voidBuffer: WebGLBuffer | null = null
  voidVertices = 0
  /** The riders' own buffer, rewritten whole every frame one of them moves. */
  rideBuffer: WebGLBuffer | null = null
  /** Every rider's triangles back to back, for one upload; grown, never rebuilt per frame. */
  private rideScratch = new Float32Array(0)

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    dotProgram: WebGLProgram,
    posBuffer: WebGLBuffer | null,
    quadBuffer: WebGLBuffer | null,
  ) {
    this.gl = gl
    this.program = program
    this.dotProgram = dotProgram
    this.posBuffer = posBuffer
    this.quadBuffer = quadBuffer
  }

  /**
   * Both programs and the two buffers every frame needs, in the order the
   * layer has always made them. All of it or nothing: a throw from `link`
   * leaves the layer with no resources rather than half of them.
   */
  static create(gl: WebGL2RenderingContext): GlResources {
    const program = link(gl, VERT, FRAG)
    const dotProgram = link(gl, DOT_VERT, DOT_FRAG)
    return new GlResources(gl, program, dotProgram, gl.createBuffer(), gl.createBuffer())
  }

  /** Whether the diagnostic colour buffer exists at all; spec §8 says a monochrome board allocates none. */
  get hasColors(): boolean {
    return this.colorBuffer !== null
  }

  /** The board's triangles, and its colours when the view asks for them. */
  upload(scene: Scene | null, colored: boolean): void {
    const gl = this.gl
    if (!this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, scene?.positions ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    // The colour buffer is the diagnostic mode's alone: a monochrome board
    // takes its colour from a uniform and allocates nothing (spec §8).
    if (scene && colored) {
      this.colorBuffer ??= gl.createBuffer()
      if (this.colorBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, tesselateColors(scene), gl.STATIC_DRAW)
      }
    }
  }

  /** The void strips' triangles, as `voidQuads` built them. */
  uploadVoids(data: Float32Array): void {
    const gl = this.gl
    this.voidBuffer ??= gl.createBuffer()
    this.voidVertices = data.length / 2
    if (this.voidBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.voidBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    }
  }

  /**
   * Collapses one piece's triangles in the static buffer, or writes them back
   * from the scene. A collapsed triangle has all three vertices at the origin,
   * so it covers no fragment at all.
   */
  writeRange(scene: Scene, r: PieceRanges, visible: boolean): void {
    const gl = this.gl
    if (!this.posBuffer) return
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
   * the other one for the frame. Takes the map rather than an iterator because
   * it walks the riders twice.
   */
  uploadRiders(riders: ReadonlyMap<number, Rider>): void {
    const gl = this.gl
    let total = 0
    for (const r of riders.values()) total += r.count
    if (total === 0) return
    if (this.rideScratch.length < total * 2) this.rideScratch = new Float32Array(total * 2)
    let at = 0
    for (const r of riders.values()) {
      r.start = at
      this.rideScratch.set(r.data.subarray(0, r.count * 2), at * 2)
      at += r.count
    }
    this.rideBuffer ??= gl.createBuffer()
    if (!this.rideBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rideBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.rideScratch.subarray(0, total * 2), gl.DYNAMIC_DRAW)
  }

  /** Deletes every object this holds; the layer drops the instance straight after. */
  delete(): void {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteProgram(this.dotProgram)
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)
    if (this.rideBuffer) gl.deleteBuffer(this.rideBuffer)
    if (this.voidBuffer) gl.deleteBuffer(this.voidBuffer)
  }
}
