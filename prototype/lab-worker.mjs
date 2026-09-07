// Worker laboratorium: cała generacja dzieje się tutaj, żeby interfejs został
// responsywny. Plansza 1000×1000 liczy się dziesiątki sekund — na wątku
// głównym zawiesiłaby kartę.
//
// Worker trzyma ostatnią wygenerowaną planszę u siebie, więc przełączenie
// koloru albo liczby wyróżnionych elementów przerysowuje SVG bez ponownej
// generacji.
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

function render(view) {
  if (!last) return
  const svg = toSvg(last.board, {
    cell: view.cell, colored: view.colored, strokeRatio: view.stroke, top: view.top,
    voids: view.voids,
  })
  self.postMessage({ type: 'render', svg, longest: longestSummary(last.board, view.top) })
}

self.onmessage = (event) => {
  const { type, params, view } = event.data

  if (type === 'render') { render(view); return }

  if (type === 'generate') {
    const started = performance.now()
    let result
    try {
      result = generate({
        ...params,
        // Postęp wysyłamy na bieżąco: przy dużych planszach użytkownik musi
        // widzieć, że coś się dzieje, i móc przerwać.
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
    })
    render(view)
  }
}
