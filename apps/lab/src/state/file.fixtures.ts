import { type BoardMeta, defaultParams, encodeBoard, generate, layoutHash } from '@fronthub/arrowz-engine'
import { DEFAULT_VIEW } from '@fronthub/arrowz-engine/command'

/** A board file and its meta as a person would pick them from a store folder: a real carve, a real layout hash. */
export async function fileFixture(
  seed: number,
  W = 8,
  H = 8,
): Promise<{ board: File; meta: File; metaJson: BoardMeta }> {
  const params = { ...defaultParams(), W, H, seed }
  const result = generate(params)
  const file = encodeBoard(result.board)
  const id = await layoutHash(result.board)
  const metaJson: BoardMeta = {
    id,
    W,
    H,
    seed,
    params,
    view: { ...DEFAULT_VIEW, top: 0 },
    command: `deno task carve --width=${W} --height=${H} --seed=${seed}`,
    source: 'cli',
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z',
    ok: result.ok,
    pieces: result.board.pieces.length,
    maxLen: result.metrics?.maxLen ?? null,
    genMs: result.genMs,
    fingerprint: file.fingerprint,
    boardBytes: null,
    svg: false,
    restarts: result.restartsUsed,
    backtracks: result.backtracks,
    aborted: false,
    stuck: result.stuck,
    sources: [],
  }
  return {
    board: new File([JSON.stringify(file)], `${id}.board.json`, { type: 'application/json' }),
    meta: new File([JSON.stringify(metaJson)], `${id}.json`, { type: 'application/json' }),
    metaJson,
  }
}
