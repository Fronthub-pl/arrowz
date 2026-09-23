import { type BoardMeta, type BoardSize, defaultParams, encodeBoard, generate } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'

/**
 * A stored board as the store would hold it: a real carve, its file, and a meta
 * with the fields the list row and the status line read. Hand-built rather than
 * fetched, because these tests must not need a server — `boards.node.test.ts`
 * is where a real store is exercised.
 *
 * The id is a plausible layout hash for a one- or two-digit seed: `sha256-`
 * and 64 hex digits, 71 characters in all, so a row that clips it is being
 * clipped for the real reason. A seed of 100 or more would overrun that,
 * and every caller here passes a small one.
 */
export function storedFixture(seed: number, W = 8, H = 8): { meta: BoardMeta; file: unknown } {
  const params = { ...defaultParams(), W, H, seed }
  const result = generate(params)
  const file = encodeBoard(result.board)
  const id = `sha256-${String(seed).padStart(2, '0').repeat(32)}`
  return {
    meta: {
      id,
      W,
      H,
      seed,
      params,
      view: { ...DEFAULT_VIEW, top: 0 },
      command: `deno task carve --width=${W} --height=${H} --seed=${seed}`,
      source: 'lab',
      createdAt: '2026-09-16T10:00:00.000Z',
      updatedAt: '2026-09-16T10:00:00.000Z',
      ok: result.ok,
      pieces: result.board.pieces.length,
      maxLen: result.metrics?.maxLen ?? null,
      genMs: result.genMs,
      fingerprint: null,
      boardBytes: null,
      svg: false,
      restarts: result.restartsUsed,
      backtracks: result.backtracks,
      aborted: false,
      stuck: result.stuck,
      sources: [],
    },
    file,
  }
}

/**
 * Two sizes, the first holding two boards (newest first, as the store lists
 * them) and the second holding one. A single size cannot discriminate
 * the rail's `open.size ?? sizes?.[0]?.size` fallback (`openEntry`) from a plain
 * `sizes?.[0]?.size`, because the address's size and the first listed size
 * always coincide when there is only one — hence the second size here.
 */
export function sizesFixture(): BoardSize[] {
  const first = storedFixture(1)
  const second = storedFixture(2)
  const third = storedFixture(3, 6, 6)
  return [
    { size: '8x8', W: 8, H: 8, cells: 64, boards: [second.meta, first.meta] },
    { size: '6x6', W: 6, H: 6, cells: 36, boards: [third.meta] },
  ]
}
