import type { BoardMeta, BoardSize, StoreRequest } from '@arrowz/engine'

export type SaveOutcome = { ok: true; meta: BoardMeta } | { ok: false; error: string }

/** The listing, or why it could not be had — the library says different things about the two. */
export type ListOutcome = { ok: true; sizes: BoardSize[] } | { ok: false; error: string }

/** A stored board file as the store holds it, undecoded. */
export type FileOutcome = { ok: true; file: unknown } | { ok: false; error: string }

/**
 * The store is optional: the lab runs from any static host, and a missing
 * server must cost the run nothing. Every call therefore reports failure as a
 * value. A rejected `fetch` and an answer that is not OK are treated alike —
 * a store that refuses the connection and a store that returns 500 are the
 * same thing to a caller with a list to render.
 *
 * The listing says which failure happened, because the library has two
 * sentences for them: "no store server" for an unreachable store and "the
 * store is empty" for a store that answers with nothing (Ruling 2). An empty
 * list is a success.
 */
export async function listBoards(): Promise<ListOutcome> {
  try {
    const response = await fetch('/api/boards')
    if (!response.ok) return { ok: false, error: `the store answered ${response.status}` }
    return { ok: true, sizes: (await response.json()) as BoardSize[] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * One stored board file, by its size folder and its layout hash. The file is
 * returned as `unknown`: `decodeBoard` takes `unknown` and is the only thing
 * entitled to decide the shape is a board.
 */
export async function readStoredBoard(size: string, id: string): Promise<FileOutcome> {
  try {
    const response = await fetch(`/store/${size}/${id}.board.json`)
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    return { ok: true, file: await response.json() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
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
  if (response.status === 201) {
    // Guarded like the failure path below it: a 201 whose body will not parse
    // is still a failure, and an unguarded `await` here would reject a promise
    // this module promises never to reject — the caller in App.tsx has no
    // `.catch`, so the run's status line would simply never learn the outcome.
    try {
      return { ok: true, meta: (await response.json()) as BoardMeta }
    } catch (err) {
      return {
        ok: false,
        error: `the store answered 201 with a body this lab cannot read: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return { ok: false, error: body.error ?? `the store answered ${response.status}` }
}

/** Whether the store still holds the board, or why it could not be asked. */
export type DeleteOutcome = { ok: true; deleted: boolean } | { ok: false; error: string }

/**
 * Removes one stored board. A 404 is an outcome, not a failure (Ruling 11):
 * pressing Delete on a board another window has already removed means the same
 * thing to the caller as removing it here — it is not there. `ok: false` is
 * kept for a store that could not be reached or answered with a fault, which
 * is the distinction every other call in this module makes.
 *
 * Both segments are encoded: an id is a hash and a size is `WxH`, so neither
 * carries a slash today, and a path built by concatenation that stops being
 * true later is the kind of thing this file should not leave lying around.
 */
export async function deleteBoard(size: string, id: string): Promise<DeleteOutcome> {
  let response: Response
  try {
    response = await fetch(`/api/boards/${encodeURIComponent(size)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (response.status === 404) return { ok: true, deleted: false }
  if (!response.ok) return { ok: false, error: `the store answered ${response.status}` }
  return { ok: true, deleted: true }
}
