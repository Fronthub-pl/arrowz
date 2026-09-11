// What a frame draws, pass by pass. Each pass is a function of the GL objects
// and of the state it is handed, and keeps none of its own, so the order of a
// frame is written in one place: `GlLayer.draw`.
import type { BoardData } from '@arrowz/engine'
import type { Rgba } from './gl-color.ts'
import type { GlResources } from './gl-resources.ts'
import type { Rider } from './rides.ts'
import type { Block, Scene } from './tesselate.ts'
import { MIN_POINT_CELL_PX, type Viewport } from './viewport.ts'

/** The blocks in draw order, with where each takes its colour from. */
const PASSES: readonly { block: Block; highlight: boolean }[] = [
  { block: 'lines', highlight: false },
  { block: 'topLines', highlight: true },
  { block: 'heads', highlight: false },
  { block: 'topHeads', highlight: true },
]

/** The point grid as the layer was last told to show it. */
export interface Points {
  visible: boolean
  rgba: Rgba
  radius: number
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
function bindAttrs(
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

/**
 * The three uniforms both programs place the board with: the view's top left
 * in cells, a cell's size in device pixels, and the drawing buffer's size.
 * `program` must be the one in use.
 */
export function setView(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  vp: Viewport,
  width: number,
  height: number,
): void {
  gl.uniform2f(gl.getUniformLocation(program, 'u_origin'), vp.originX, vp.originY)
  gl.uniform1f(gl.getUniformLocation(program, 'u_scale'), vp.cellPx * devicePixelRatio)
  gl.uniform2f(gl.getUniformLocation(program, 'u_size'), width, height)
}

/** The paper: one quad over the cells plus the margin. */
export function drawPaper(res: GlResources, board: BoardData, pad: number, paper: Rgba): void {
  if (!res.quadBuffer) return
  const gl = res.gl
  const p = pad
  const x0 = -p, y0 = -p, x1 = board.W + p, y1 = board.H + p
  const quad = new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1])
  gl.bindBuffer(gl.ARRAY_BUFFER, res.quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
  bindAttrs(gl, res.program, res.quadBuffer, null)
  gl.uniform1i(gl.getUniformLocation(res.program, 'u_useAttr'), 0)
  gl.uniform4fv(gl.getUniformLocation(res.program, 'u_flat'), paper)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

/**
 * The grid over the cells alone: 0,0 to W,H, the margin left blank, shown
 * only once a cell is big enough to hold a dot — below MIN_POINT_CELL_PX a
 * dense raster of dots moirés instead of reading as dots. The element
 * decides that, because only it knows `cellPx`; the pass refuses on its own
 * as well, so a viewport handed straight to the layer cannot get past it.
 */
export function drawDots(
  res: GlResources,
  board: BoardData,
  vp: Viewport,
  width: number,
  height: number,
  points: Points,
): void {
  const prog = res.dotProgram
  if (!res.quadBuffer) return
  if (!points.visible || vp.cellPx < MIN_POINT_CELL_PX) return
  const gl = res.gl
  const quad = new Float32Array([0, 0, board.W, 0, board.W, board.H, 0, 0, board.W, board.H, 0, board.H])
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, res.quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
  bindAttrs(gl, prog, res.quadBuffer, null)
  setView(gl, prog, vp, width, height)
  gl.uniform4fv(gl.getUniformLocation(prog, 'u_dot'), points.rgba)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_radius'), points.radius)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_feather'), 1 / (vp.cellPx * devicePixelRatio))
  gl.drawArrays(gl.TRIANGLES, 0, 6)
  // Restores the main program: every pass after this one — the voids and
  // the piece blocks — assumes it is the active program and current.
  gl.useProgram(res.program)
}

/** The cells the generator failed to carve, in the highlight colour at .22 opacity — the SVG group's fill-opacity. */
export function drawVoids(res: GlResources, highlight: Rgba): void {
  if (res.voidVertices === 0 || !res.voidBuffer) return
  const gl = res.gl
  bindAttrs(gl, res.program, res.voidBuffer, null)
  gl.uniform1i(gl.getUniformLocation(res.program, 'u_useAttr'), 0)
  const [r, g, b, a] = highlight
  gl.uniform4fv(gl.getUniformLocation(res.program, 'u_flat'), [r, g, b, a * 0.22])
  gl.drawArrays(gl.TRIANGLES, 0, res.voidVertices)
}

/**
 * The four blocks of the static buffer, in `PASSES` order. `useAttr` is true
 * when the board is drawn in its diagnostic colours and the colour buffer
 * exists.
 */
export function drawPieces(res: GlResources, scene: Scene, useAttr: boolean, ink: Rgba, highlight: Rgba): void {
  const gl = res.gl
  const program = res.program
  bindAttrs(gl, program, res.posBuffer, useAttr ? res.colorBuffer : null)
  for (const pass of PASSES) {
    const range = scene.blocks[pass.block]
    if (range.count === 0) continue
    // Highlighted pieces take one flat colour, so the diagnostic hues never
    // reach them — the same rule the SVG group carried on its stroke.
    gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), !pass.highlight && useAttr ? 1 : 0)
    gl.uniform4fv(gl.getUniformLocation(program, 'u_flat'), pass.highlight ? highlight : ink)
    gl.drawArrays(gl.TRIANGLES, range.start, range.count)
  }
}

/**
 * The pieces part way down their own track, over the resting ones and
 * clipped to the paper. Only a riding piece is clipped: a scissor over the
 * whole board would cost nothing here, but the rule is the SVG's — a piece
 * leaves at the paper's edge, and nothing else ever reaches it.
 */
export function drawRiders(
  res: GlResources,
  riders: ReadonlyMap<number, Rider>,
  vp: Viewport,
  board: BoardData,
  pad: number,
  height: number,
): void {
  if (riders.size === 0 || !res.rideBuffer) return
  const gl = res.gl
  const program = res.program
  const s = vp.cellPx * devicePixelRatio
  const p = pad
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
  gl.scissor(left, height - bottom, right - left, bottom - top)
  bindAttrs(gl, program, res.rideBuffer, null)
  gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), 0)
  const flat = gl.getUniformLocation(program, 'u_flat')
  for (const r of riders.values()) {
    if (r.count === 0) continue
    gl.uniform4fv(flat, r.color)
    gl.drawArrays(gl.TRIANGLES, r.start, r.count)
  }
  gl.disable(gl.SCISSOR_TEST)
}
