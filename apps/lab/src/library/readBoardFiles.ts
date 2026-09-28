import { type BoardData, type BoardFile, type BoardMeta, decodeBoard, encodeBoard, layoutHash } from '@arrowz/engine'

/** Why an open failed, worded by the dictionary (`open_<problem>`). A decode failure keeps the decoder's own words. */
export type OpenProblem = 'notJson' | 'noBoard' | 'twoBoards' | 'metaOther' | 'notMeta'

export type ReadOutcome =
  | { ok: true; board: BoardData; file: BoardFile; meta: BoardMeta | null; name: string; id: string }
  | { ok: false; name: string; problem: OpenProblem; reason: null }
  | { ok: false; name: string; problem: null; reason: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Enough of a store meta to load from: the id to match, and the fields Load into lab and the facts read. */
function asMeta(value: unknown): BoardMeta | null {
  if (!isObject(value)) return null
  const { id, W, H, seed, params, view, command } = value
  const shaped =
    typeof id === 'string' &&
    typeof W === 'number' &&
    typeof H === 'number' &&
    typeof seed === 'number' &&
    isObject(params) &&
    isObject(view) &&
    typeof command === 'string'
  // The store wrote it; the checks above are what this reader relies on.
  return shaped ? (value as unknown as BoardMeta) : null
}

/**
 * One board file, and optionally its meta (the store's `<id>.json`), in any
 * order. The meta is kept only when its id is the board's layout hash, so a
 * renamed pair opens and a meta from another board is refused, not glued on.
 */
export async function readBoardFiles(files: readonly File[]): Promise<ReadOutcome> {
  const first = files[0]?.name ?? ''
  const parsed: { name: string; value: unknown }[] = []
  for (const file of files) {
    try {
      parsed.push({ name: file.name, value: JSON.parse(await file.text()) })
    } catch {
      return { ok: false, name: file.name, problem: 'notJson', reason: null }
    }
  }
  const boards = parsed.filter((entry) => isObject(entry.value) && entry.value.format === 'arrowz-board')
  const rest = parsed.filter((entry) => !boards.includes(entry))
  const found = boards[0]
  if (found === undefined) return { ok: false, name: first, problem: 'noBoard', reason: null }
  if (boards.length > 1) return { ok: false, name: found.name, problem: 'twoBoards', reason: null }
  if (rest.length > 1) return { ok: false, name: found.name, problem: 'notMeta', reason: null }
  let board: BoardData
  try {
    board = decodeBoard(found.value)
  } catch (err) {
    return { ok: false, name: found.name, problem: null, reason: err instanceof Error ? err.message : String(err) }
  }
  const id = await layoutHash(board)
  const extra = rest[0]
  let meta: BoardMeta | null = null
  if (extra !== undefined) {
    meta = asMeta(extra.value)
    if (meta === null) return { ok: false, name: found.name, problem: 'notMeta', reason: null }
    if (meta.id !== id) return { ok: false, name: found.name, problem: 'metaOther', reason: null }
  }
  // Re-encoded from the decoded board: the file downloads and draws as the codec writes it.
  return { ok: true, board, file: encodeBoard(board), meta, name: found.name, id }
}
