// Generation off the main thread: Insane takes tens of seconds.
import { defaultParams, generate } from '@arrowz/engine'
import type { Board, ParamKey } from '@arrowz/engine'

export interface DemoRequest {
  overrides: Partial<Record<ParamKey, number>>
  seed: number
}

export interface DemoResponse {
  board: Board
  ok: boolean
  genMs: number
}

/**
 * The object the carver hands back is structurally wider than `Board`: it also
 * carries its scratch buffers and the seeded rng, and a closure cannot be
 * structured-cloned (postMessage throws DataCloneError). The message carries
 * the seven declared fields and nothing else.
 */
function plain(b: Board): Board {
  return {
    W: b.W,
    H: b.H,
    owner: b.owner,
    pieces: b.pieces,
    stats: b.stats,
    backtracks: b.backtracks,
    remaining: b.remaining,
  }
}

self.onmessage = (e: MessageEvent<DemoRequest>) => {
  const t0 = performance.now()
  const r = generate({ ...defaultParams(), ...e.data.overrides, seed: e.data.seed })
  const msg: DemoResponse = { board: plain(r.board), ok: r.ok, genMs: performance.now() - t0 }
  self.postMessage(msg)
}
