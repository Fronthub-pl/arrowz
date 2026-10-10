import {
  type BoardFile,
  type BoardMeta,
  type BoardSize,
  defaultParams,
  encodeBoard,
  generate,
  type Params,
  type Recipe,
} from '@fronthub/arrowz-engine'
import { boardId, DEFAULT_VIEW } from '@fronthub/arrowz-engine/command'

/**
 * A stored board as the store would hold it: a real carve, its file, and a meta
 * with the fields the list row and the status line read. Hand-built, so these
 * tests need no server (`boards.node.test.ts` exercises a real store).
 *
 * The id has a real hash's length (`sha256-` and 64 hex digits) for a seed
 * below 100, so a row that clips it clips it for the real reason.
 */
export function storedFixture(seed: number, W = 8, H = 8): { meta: BoardMeta; file: BoardFile } {
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
 * them) and the second one. With a single size, the address's size and the
 * first listed size always coincide, hiding a fallback bug in `openEntry`.
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

/**
 * `storedFixture` as a second save of the same seed with another `restarts`
 * leaves it: two recipes, the second the latest, which the top-level fields
 * copy. Both values differ from the knob's default (3), so loading either
 * one moves the knob.
 */
export function twoRecipesFixture(seed = 1): { meta: BoardMeta; file: BoardFile } {
  const { meta, file } = storedFixture(seed)
  const recipe = (restarts: number, at: string): Recipe => {
    const params: Params = { ...meta.params, restarts }
    return {
      id: boardId(params),
      params,
      view: meta.view,
      command: `deno task carve --width=${meta.W} --height=${meta.H} --seed=${seed} --restarts=${restarts}`,
      source: 'lab',
      createdAt: at,
      updatedAt: at,
      genMs: meta.genMs,
      restarts: meta.restarts,
      backtracks: meta.backtracks,
      aborted: false,
    }
  }
  const older = recipe(5, '2026-09-16T10:00:00.000Z')
  const latest = recipe(1, '2026-09-17T10:00:00.000Z')
  return {
    meta: {
      ...meta,
      params: latest.params,
      command: latest.command,
      updatedAt: latest.updatedAt,
      sources: [older, latest],
    },
    file,
  }
}
