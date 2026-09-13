import type { BoardMeta, BoardSize, StoreRequest } from '@arrowz/engine'

export type SaveOutcome = { ok: true; meta: BoardMeta } | { ok: false; error: string }

/**
 * The store is optional: the lab runs from any static host, and a missing
 * server must cost the run nothing. Both calls therefore report failure as a
 * value. A rejected `fetch` and an answer that is not OK are treated alike —
 * a store that refuses the connection and a store that returns 500 are the
 * same thing to a caller with a list to render.
 */
export async function listBoards(): Promise<BoardSize[]> {
  try {
    const response = await fetch('/api/boards')
    if (!response.ok) return []
    return (await response.json()) as BoardSize[]
  } catch {
    return []
  }
}

export async function saveBoard(request: StoreRequest): Promise<SaveOutcome> {
  let response: Response
  try {
    response = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (response.status === 201) return { ok: true, meta: (await response.json()) as BoardMeta }
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return { ok: false, error: body.error ?? `the store answered ${response.status}` }
}
