// Generation off the main thread: Insane takes tens of seconds.
import { defaultParams, generate } from '@arrowz/engine'
import type { Board, ParamKey } from '@arrowz/engine'

export interface DemoRequest {
  overrides: Partial<Record<ParamKey, number>>
  seed: number
}

export type DemoResponse =
  | { board: Board; ok: boolean; genMs: number }
  | { error: string }

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
  let msg: DemoResponse
  try {
    // generate() throws InvalidParamsError for anything outside the safe
    // envelope; without this the page would sit on "generating…" for ever.
    const r = generate({ ...defaultParams(), ...e.data.overrides, seed: e.data.seed })
    msg = { board: plain(r.board), ok: r.ok, genMs: performance.now() - t0 }
  } catch (err) {
    msg = { error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(msg)
}
