/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
// Laboratory worker: all generation happens here so that the interface stays
// responsive. A 1000×1000 board takes tens of seconds to compute — on the main
// thread it would freeze the tab.
//
// The worker keeps the last generated board on its side, so switching the
// colour or the number of highlighted pieces redraws the SVG without
// regenerating.
import { generate, toSvg } from './engine.ts'
import type { Board, LongestSummary, Metrics, Params, View, WorkerIn, WorkerOut } from './types.ts'

let last: { board: Board; metrics: Metrics | null; params: Params } | null = null

const post = (m: WorkerOut) => self.postMessage(m)

function longestSummary(board: Board, n: number): LongestSummary[] {
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
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        if (own.has((c.y + dy) * W + (c.x + dx))) touch++
      }
      if (touch >= 3) coil++
    }
    const sx = maxX - minX + 1
    const sy = maxY - minY + 1
    return {
      len: pc.cells.length,
      sx,
      sy,
      span: Math.max(sx / board.W, sy / board.H),
      density: pc.cells.length / (sx * sy),
      coil: coil / pc.cells.length,
    }
  })
}

// `tag` comes back with the SVG so the page can tell a preview apart from a
// render made for the store (no highlight). `voids` travels next to the view
// (View has no such field): the page sends its "show jammed cells" checkbox.
function render(view: View, voids: boolean | undefined, tag?: string) {
  if (!last) return
  const svg = toSvg(last.board, {
    cell: view.cell,
    colored: view.colored,
    strokeRatio: view.stroke,
    headWidth: view.headWidth,
    headHeight: view.headHeight,
    top: view.top,
    ...(voids !== undefined ? { voids } : {}),
  })
  post({ type: 'render', svg, longest: longestSummary(last.board, view.top), ...(tag ? { tag } : {}) })
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const msg = event.data
  if (msg.type === 'render') {
    render(msg.view, msg.voids, msg.tag)
    return
  }
  const started = performance.now()
  let result
  try {
    result = generate({
      ...msg.params,
      // Progress is sent as it happens: on large boards the user has to
      // see that something is going on, and be able to abort.
      trace: (info) => post({ type: 'progress', info }),
    })
  } catch (err) {
    // Includes the InvalidParamsError generate() throws for parameters outside
    // the safe envelope: its message lists the violations and the page shows it.
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    return
  }
  last = { board: result.board, metrics: result.metrics, params: msg.params }
  post({
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
  render(msg.view, msg.voids)
}
