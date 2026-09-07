// Laboratory worker: all generation happens here so that the interface stays
// responsive. A 1000×1000 board takes tens of seconds to compute — on the main
// thread it would freeze the tab.
//
// The worker keeps the last generated board on its side, so switching the
// colour or the number of highlighted pieces redraws the SVG without
// regenerating.
import { generate, toSvg } from './engine.mjs'

let last = null      // { board, metrics, params }

function longestSummary(board, n) {
  const W = board.W
  const longest = [...board.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, n)
  return longest.map((pc) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const own = new Set(pc.cells.map((c) => c.y * W + c.x))
    let coil = 0
    for (const c of pc.cells) {
      if (c.x < minX) minX = c.x
      if (c.x > maxX) maxX = c.x
      if (c.y < minY) minY = c.y
      if (c.y > maxY) maxY = c.y
      let touch = 0
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (own.has((c.y + dy) * W + (c.x + dx))) touch++
      }
      if (touch >= 3) coil++
    }
    const sx = maxX - minX + 1
    const sy = maxY - minY + 1
    return {
      len: pc.cells.length, sx, sy,
      span: Math.max(sx / board.W, sy / board.H),
      density: pc.cells.length / (sx * sy),
      coil: coil / pc.cells.length,
    }
  })
}

// `tag` comes back with the SVG so the page can tell a preview apart from a
// render made for the store (no highlight).
function render(view, tag) {
  if (!last) return
  const svg = toSvg(last.board, {
    cell: view.cell, colored: view.colored, strokeRatio: view.stroke, top: view.top,
    voids: view.voids,
  })
  self.postMessage({ type: 'render', svg, longest: longestSummary(last.board, view.top), tag })
}

self.onmessage = (event) => {
  const { type, params, view, tag } = event.data

  if (type === 'render') { render(view, tag); return }

  if (type === 'generate') {
    const started = performance.now()
    let result
    try {
      result = generate({
        ...params,
        // Progress is sent as it happens: on large boards the user has to
        // see that something is going on, and be able to abort.
        trace: (info) => self.postMessage({ type: 'progress', info }),
      })
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message })
      return
    }
    last = { board: result.board, metrics: result.metrics, params }

    self.postMessage({
      type: 'done',
      ok: result.ok,
      metrics: result.metrics,
      backtracks: result.backtracks,
      restartsUsed: result.restartsUsed,
      genMs: result.genMs,
      metricsMs: result.metricsMs,
      totalMs: performance.now() - started,
      stuck: result.stuck,
      pieces: result.board.pieces.length,
      stats: result.board.stats,
    })
    render(view)
  }
}
