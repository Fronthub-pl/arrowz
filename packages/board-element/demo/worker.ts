// Generation off the main thread: Insane takes tens of seconds.
import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import type { BoardFile, ParamKey } from '@arrowz/engine'

export interface DemoRequest {
  overrides: Partial<Record<ParamKey, number>>
  seed: number
}

/**
 * The board travels as its file: one string crosses the worker boundary
 * instead of ~90 000 piece objects, and the page walks the path a game will
 * walk with a board from Storage — file, decodeBoard, element.
 */
export type DemoResponse =
  | { board: BoardFile; ok: boolean; genMs: number }
  | { error: string }

self.onmessage = (e: MessageEvent<DemoRequest>) => {
  const t0 = performance.now()
  let msg: DemoResponse
  try {
    // generate() throws InvalidParamsError for anything outside the safe
    // envelope; without this the page would sit on "generating…" for ever.
    const r = generate({ ...defaultParams(), ...e.data.overrides, seed: e.data.seed })
    msg = { board: encodeBoard(r.board), ok: r.ok, genMs: performance.now() - t0 }
  } catch (err) {
    msg = { error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(msg)
}
