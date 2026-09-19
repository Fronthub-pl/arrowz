import { expect, test } from 'vitest'
import { defaultParams, generate } from '@arrowz/engine'
import './mod.ts'
import type { ArrowzBoard } from './mod.ts'
import type { GlLayer } from './gl-layer.ts'
import { themeOf, THEMES } from './themes.ts'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const board = generate({ ...defaultParams(), W: 20, H: 20, seed: 5 }).board

/**
 * The layer is a private field; the cast is the same seam
 * `docs-api.browser.test.ts` uses to reach a fresh element's own property
 * values, not a spy on the module — `gl-layer.ts` binds its imports at
 * import time, so nothing here could intercept a call to `setColors` or
 * `setBoard` from outside the instance.
 */
function layerOf(el: ArrowzBoard): GlLayer {
  return (el as unknown as { layer: GlLayer }).layer
}

async function mount(): Promise<ArrowzBoard> {
  const el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  document.body.append(el)
  await el.updateComplete
  await raf()
  await raf()
  return el
}

test('a named theme paints its own paper', async () => {
  const el = await mount()
  el.enableColors = true
  el.theme = 'gruvbox-dark'
  el.board = board
  await el.updateComplete
  await raf()
  const canvas = el.shadowRoot?.querySelector('canvas')
  const gl = canvas?.getContext('webgl2')
  expect(gl).toBeTruthy()
  const bytes = new Uint8Array(4)
  gl?.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
  // #282828 is gruvbox-dark's paper.
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0x28, 0x28, 0x28])
  el.remove()
})

test('an explicit view field beats the theme', async () => {
  const el = await mount()
  el.enableColors = true
  el.theme = 'gruvbox-dark'
  el.view = { paper: '#ff00ff' }
  el.board = board
  await el.updateComplete
  await raf()
  const canvas = el.shadowRoot?.querySelector('canvas')
  const gl = canvas?.getContext('webgl2')
  const bytes = new Uint8Array(4)
  gl?.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0x00, 0xff])
  el.remove()
})

test('an unknown theme is ignored, not thrown on', async () => {
  const el = await mount()
  el.board = board
  el.theme = 'no-such-theme'
  await el.updateComplete
  await raf()
  expect(el.pieceCount).toBe(board.pieces.length)
  el.remove()
})

test('the twelve names are the ones the element answers to', async () => {
  const el = await mount()
  el.enableColors = true
  el.board = board
  for (const name of Object.keys(THEMES)) {
    el.theme = name
    await el.updateComplete
    await raf()
    expect(el.pieceCount, name).toBe(board.pieces.length)
  }
  el.remove()
})

// Only colours moved (the board, the geometry fields and enableColors did
// not), so `updated()` must route through `GlLayer.setColors` rather than
// `redraw()`/`setBoard` — `scenesBuiltForTest` only `setBoard` advances (see
// `gl-colors.browser.test.ts`), so a swap that leaves it where it started is
// a swap that took the cheap path.
test('changing only the theme repaints without re-tesselating', async () => {
  const el = await mount()
  el.enableColors = true
  el.theme = 'gruvbox-dark'
  el.board = board
  await el.updateComplete
  await raf()
  const layer = layerOf(el)
  const built = layer.scenesBuiltForTest
  el.theme = 'tokyonight-storm'
  await el.updateComplete
  await raf()
  expect(layer.scenesBuiltForTest).toBe(built)
  el.remove()
})

// Ruling 2: spec §3.1 governs over §8's test list (see the plan's design
// note). Without enableColors a theme still supplies paper, ink and
// highlight — the surface, not "colours of pieces" — but the palette must
// not apply. The paper half of that is read the same way the tests above
// read it. The piece half needs a location the geometry actually draws:
// gl-passes.ts's drawPieces passes `useAttr = view.colored && hasColorBuffer`
// to the shader, and with it false every piece pass draws flat `ink`,
// ignoring the per-piece colour attribute buffer entirely — so a piece pixel
// that reads back as the theme's ink, and not as any of its five palette
// accents, is a piece the palette never touched, not merely a piece that
// happens to look like it.
test('with enableColors off, a theme still paints paper and ink but never the palette', async () => {
  const el = await mount()
  el.theme = 'gruvbox-dark'
  el.board = board
  await el.updateComplete
  await raf()
  expect(el.enableColors).toBe(false)

  const canvas = el.shadowRoot?.querySelector('canvas')
  const gl = canvas?.getContext('webgl2')
  expect(gl).toBeTruthy()
  if (!gl || !canvas) throw new Error('need a canvas and a webgl2 context')

  const paperBytes = new Uint8Array(4)
  gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, paperBytes)
  expect([paperBytes[0], paperBytes[1], paperBytes[2]]).toEqual([0x28, 0x28, 0x28])

  const theme = themeOf('gruvbox-dark')
  if (!theme) throw new Error('gruvbox-dark is a built-in theme')
  const piece = board.pieces[0]
  const head = piece?.cells[0]
  const vp = el.viewport
  if (!piece || !head || !vp) throw new Error('need a piece and a viewport')
  const dpr = devicePixelRatio
  const px = Math.round((head.x + 0.5 - vp.originX) * vp.cellPx * dpr)
  const pyFromTop = Math.round((head.y + 0.5 - vp.originY) * vp.cellPx * dpr)
  const py = canvas.height - 1 - pyFromTop
  const pieceBytes = new Uint8Array(4)
  gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pieceBytes)
  const inkHex = theme.ink.replace('#', '')
  const ink = [0, 2, 4].map((i) => Number.parseInt(inkHex.slice(i, i + 2), 16))
  expect([pieceBytes[0], pieceBytes[1], pieceBytes[2]]).toEqual(ink)
  for (const accent of theme.palette) {
    const hex = accent.replace('#', '')
    const rgb = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    expect([pieceBytes[0], pieceBytes[1], pieceBytes[2]]).not.toEqual(rgb)
  }
  el.remove()
})
