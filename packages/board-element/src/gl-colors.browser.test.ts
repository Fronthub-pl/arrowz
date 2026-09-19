// The cheap path, asserted on what it does rather than on how long it takes:
// a CI runner without a GPU cannot be timed, but it can be asked whether the
// geometry was rebuilt. The counter is a test seam like `drawsForTest` and
// `hasColorsForTest` beside it — spying on the module would not work, because
// `gl-layer.ts` binds `tesselateBoard` at import.
import { expect, test } from 'vitest'
import { defaultParams, generate } from '@arrowz/engine'
import { GlLayer } from './gl-layer.ts'
import { fit } from './viewport.ts'
import { DEFAULT_VIEW } from './view.ts'

const HOST = 300
const board = generate({ ...defaultParams(), W: 20, H: 20, seed: 5 }).board
const coloured = { ...DEFAULT_VIEW, colored: true, palette: ['#ff0000', '#00ff00', '#0000ff'] }

function mounted(): GlLayer {
  const layer = new GlLayer()
  layer.canvas.style.width = `${HOST}px`
  layer.canvas.style.height = `${HOST}px`
  document.body.append(layer.canvas)
  layer.restore()
  layer.setViewport(fit({ W: board.W, H: board.H, hostWidth: HOST, hostHeight: HOST, pad: 0 }))
  return layer
}

test('setColors leaves the geometry alone', () => {
  const layer = mounted()
  layer.setBoard(board, coloured)
  const built = layer.scenesBuiltForTest
  layer.setColors({ ...coloured, palette: ['#111111', '#222222', '#333333'] })
  expect(layer.scenesBuiltForTest).toBe(built)
  expect(layer.hasColorsForTest).toBe(true)
  layer.dispose()
})

test('a rider takes its palette colour, not the golden angle', () => {
  const layer = mounted()
  layer.setBoard(board, coloured)
  const first = board.pieces[0]
  expect(first).toBeDefined()
  const rgba = layer.riderColorForTest(first?.id ?? 0, false)
  const wanted = coloured.palette.map((c) => c.toLowerCase())
  const asHex = '#' + rgba.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  expect(wanted).toContain(asHex)
  layer.dispose()
})
