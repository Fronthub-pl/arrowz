// Every GL object the layer makes, and every write into one. An instance
// lives exactly as long as the context it was made on: a loss drops the whole
// object and a restore makes a new one, so what the layer holds on the GPU is
// listed once, here, rather than once each for taking, losing and handing
// back a context. The lazy fields below are written only by this class; the
// passes read them.
import { DISC_FRAG, DISC_VERT, DOT_FRAG, DOT_VERT, FRAG, link, VERT } from './gl-shaders.ts'
import type { Rider } from './rides.ts'
import { FLOATS_PER_DISC, type PieceRanges, type Range, type Scene, tesselateColors } from './tesselate.ts'

/** Two triangles over [-1, 1]²: the six vertices every disc instance is drawn with. */
const UNIT_QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])

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
  readonly discProgram: WebGLProgram
  /** The whole board's discs, cx, cy and r each, in cells. */
  readonly discBuffer: WebGLBuffer | null
  /** UNIT_QUAD, written once when the resources are made. */
  readonly cornerBuffer: WebGLBuffer | null
  /** The diagnostic mode's per-vertex colours; a monochrome board never creates it. */
  colorBuffer: WebGLBuffer | null = null
  /** The diagnostic colour of every disc; made alongside `colorBuffer`, and only then. */
  discColorBuffer: WebGLBuffer | null = null
  voidBuffer: WebGLBuffer | null = null
  voidVertices = 0
  /** The riders' own buffer, rewritten whole every frame one of them moves. */
  rideBuffer: WebGLBuffer | null = null
  /** Every rider's triangles back to back, for one upload; grown, never rebuilt per frame. */
  private rideScratch = new Float32Array(0)
  /** The riders' discs, back to back, rewritten with `rideBuffer`. */
  rideDiscBuffer: WebGLBuffer | null = null
  /** Every rider's discs back to back, for one upload; grown, never rebuilt per frame. */
  private rideDiscScratch = new Float32Array(0)

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    dotProgram: WebGLProgram,
    posBuffer: WebGLBuffer | null,
    quadBuffer: WebGLBuffer | null,
    discProgram: WebGLProgram,
    discBuffer: WebGLBuffer | null,
    cornerBuffer: WebGLBuffer | null,
  ) {
    this.gl = gl
    this.program = program
    this.dotProgram = dotProgram
    this.posBuffer = posBuffer
    this.quadBuffer = quadBuffer
    this.discProgram = discProgram
    this.discBuffer = discBuffer
    this.cornerBuffer = cornerBuffer
  }

  /**
   * The three programs, the two buffers every frame needs, and the two every
   * disc does. All of it or nothing: a throw from `link` leaves the layer
   * with no resources rather than part of them.
   */
  static create(gl: WebGL2RenderingContext): GlResources {
    const program = link(gl, VERT, FRAG)
    const dotProgram = link(gl, DOT_VERT, DOT_FRAG)
    const discProgram = link(gl, DISC_VERT, DISC_FRAG)
    const cornerBuffer = gl.createBuffer()
    if (cornerBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW)
    }
    return new GlResources(
      gl,
      program,
      dotProgram,
      gl.createBuffer(),
      gl.createBuffer(),
      discProgram,
      gl.createBuffer(),
      cornerBuffer,
    )
  }

  /** Whether the diagnostic colour buffer exists at all; spec §8 says a monochrome board allocates none. */
  get hasColors(): boolean {
    return this.colorBuffer !== null
  }

  /** The board's triangles and discs, and their colours when the view asks for them. */
  upload(scene: Scene | null, colored: boolean): void {
    const gl = this.gl
    if (!this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, scene?.positions ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    if (this.discBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, scene?.discs ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    }
    // The colour buffers are the diagnostic mode's alone: a monochrome board
    // takes its colour from a uniform and allocates nothing (spec §8).
    if (scene && colored) {
      const colors = tesselateColors(scene)
      this.colorBuffer ??= gl.createBuffer()
      this.discColorBuffer ??= gl.createBuffer()
      if (this.colorBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, colors.vertices, gl.STATIC_DRAW)
      }
      if (this.discColorBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.discColorBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, colors.discs, gl.STATIC_DRAW)
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
   * Collapses one piece in the static buffers, or writes it back from the
   * scene. A collapsed triangle has all three vertices at the origin and a
   * collapsed disc has no radius, so neither covers a fragment.
   */
  writeRange(scene: Scene, r: PieceRanges, visible: boolean): void {
    if (this.posBuffer) this.writeSlices(this.posBuffer, scene.positions, [r.line, r.head], 2, visible)
    if (this.discBuffer) this.writeSlices(this.discBuffer, scene.discs, [r.corners, r.tail], FLOATS_PER_DISC, visible)
  }

  /** The ranges of `source`, `per` floats an element, into `buffer` — or zeroes of the same length. */
  private writeSlices(
    buffer: WebGLBuffer,
    source: Float32Array,
    ranges: readonly Range[],
    per: number,
    visible: boolean,
  ): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    for (const range of ranges) {
      if (range.count === 0) continue
      const slice = visible
        ? source.subarray(range.start * per, (range.start + range.count) * per)
        : new Float32Array(range.count * per)
      gl.bufferSubData(gl.ARRAY_BUFFER, range.start * per * Float32Array.BYTES_PER_ELEMENT, slice)
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
    gl.deleteProgram(this.discProgram)
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)
    if (this.rideBuffer) gl.deleteBuffer(this.rideBuffer)
    if (this.voidBuffer) gl.deleteBuffer(this.voidBuffer)
    if (this.discBuffer) gl.deleteBuffer(this.discBuffer)
    if (this.cornerBuffer) gl.deleteBuffer(this.cornerBuffer)
    if (this.discColorBuffer) gl.deleteBuffer(this.discColorBuffer)
    if (this.rideDiscBuffer) gl.deleteBuffer(this.rideDiscBuffer)
  }
}
