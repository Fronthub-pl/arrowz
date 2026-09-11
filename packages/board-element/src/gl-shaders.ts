// The GLSL the layer draws with, and how a pair of sources becomes a program.
// The main program draws every triangle the tesselator makes, in one flat
// colour or the per-vertex one; the disc program draws every tail cap and
// round join; the dot program draws the point grid.

export const VERT = `#version 300 es
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

export const FRAG = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 color;
void main() { color = v_color; }`

// The dot grid's own program: its fragment shader is the pattern the SVG
// layer tiles as a one-cell <pattern> holding one circle, expressed with no
// geometry at all — one quad over the cells, coloured per fragment.
export const DOT_VERT = `#version 300 es
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
export const DOT_FRAG = `#version 300 es
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

export function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
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
  // normal WebGL idiom, and it keeps every program built here from leaking
  // its two shader objects.
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!ok) throw new Error(`gl-layer: ${log ?? 'program did not link'}`)
  return p
}

// Every tail cap and every round join, as instances of one unit quad. The
// quad is widened by one device pixel (1 / u_scale, in cells) past the
// disc's radius so its antialiased edge has somewhere to fall. A disc of no
// radius is a removed piece's: every vertex goes to the same clip point, so
// it costs no fragment at all.
export const DISC_VERT = `#version 300 es
in vec2 a_corner;
in vec3 a_disc;
in vec4 a_color;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_size;
uniform vec4 u_flat;
uniform bool u_useAttr;
out vec2 v_local;
out float v_r;
out vec4 v_color;
void main() {
  float r = a_disc.z;
  v_r = r;
  v_color = u_useAttr ? a_color : u_flat;
  if (r <= 0.0) {
    v_local = vec2(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  v_local = a_corner * (r + 1.0 / u_scale);
  vec2 px = (a_disc.xy + v_local - u_origin) * u_scale;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
}`

// Coverage computed here, because the canvas's MSAA does not smooth an edge
// a fragment shader decides: the shader runs once a pixel. The edge ramps
// over one device pixel. A disc under half a pixel in radius is faded by
// 2 * rPx, so it carries about the ink of its own area and not a pixel's
// worth (spec §5.1). highp, unlike the other two fragment shaders: u_scale is
// shared with the vertex shader, which is highp, and GLSL ES will not link a
// uniform declared at two precisions (spec §9).
export const DISC_FRAG = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_r;
in vec4 v_color;
uniform float u_scale;
out vec4 color;
void main() {
  float rPx = v_r * u_scale;
  float dPx = length(v_local) * u_scale - rPx;
  float a = clamp(0.5 - dPx, 0.0, 1.0) * min(1.0, 2.0 * rPx);
  if (a <= 0.0) discard;
  color = vec4(v_color.rgb, v_color.a * a);
}`
