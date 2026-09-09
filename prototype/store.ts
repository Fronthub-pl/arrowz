// Store of generated boards: prototype/boards/<W>x<H>/<id>.svg + <id>.json.
// Shared by the CLI (carve.ts --svg) and the lab server. The directory is
// gitignored — a 1000×1000 board is tens of MB, and the command in the meta
// reproduces any board.
import { dirname, fromFileUrl, join } from '@std/path'
import type { BoardMeta, BoardSize, Params, Stuck, View } from './types.ts'
import { boardId, DEFAULT_VIEW } from './command.ts'
import { defaultParams } from './engine.ts'

export interface SaveInput {
  svg: string
  params: Params
  view: View
  command: string
  simpleCommand?: string
  metrics?: {
    ok?: boolean
    pieces?: number
    maxLen?: number
    genMs?: number
    restarts?: number
    backtracks?: number
    aborted?: boolean
    stuck?: Stuck | null
  }
  source: string
}

export function boardsDir(): string {
  return Deno.env.get('ARROWZ_BOARDS_DIR') || join(dirname(fromFileUrl(import.meta.url)), 'boards')
}

function exists(path: string): boolean {
  try {
    Deno.statSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * The JSON of a stored board, or null when the file is missing, broken or not
 * an object. A board saved before a knob existed lacks it in params and view:
 * the missing fields take the engine defaults here, at the boundary, so every
 * reader — the page, buildCommand — sees a complete Params and View. A board
 * saved before the closing report existed gets its empty values the same way.
 */
function readMeta(file: string): BoardMeta | null {
  try {
    const parsed: unknown = JSON.parse(Deno.readTextFileSync(file))
    if (typeof parsed !== 'object' || parsed === null) return null
    const meta = parsed as BoardMeta
    return {
      ...meta,
      params: { ...defaultParams(), ...meta.params },
      view: { ...DEFAULT_VIEW, ...meta.view },
      restarts: meta.restarts ?? null,
      backtracks: meta.backtracks ?? null,
      aborted: meta.aborted ?? false,
      stuck: meta.stuck ?? null,
    }
  } catch {
    return null
  }
}

export function saveBoard({ svg, params, view, command, simpleCommand, metrics = {}, source }: SaveInput): BoardMeta {
  const id = boardId(params)
  const size = `${params.W}x${params.H}`
  const dir = join(boardsDir(), size)
  Deno.mkdirSync(dir, { recursive: true })
  // The same id means the same board (the id hashes the parameters). An
  // overwrite — recolouring in the lab, regenerating from the CLI — keeps the
  // original createdAt, so the board stays in its place in the list, and
  // records the write in updatedAt.
  const now = new Date().toISOString()
  const metaFile = join(dir, `${id}.json`)
  const createdAt = readMeta(metaFile)?.createdAt ?? now
  const meta: BoardMeta = {
    id,
    W: params.W,
    H: params.H,
    seed: params.seed,
    params,
    view,
    command,
    ...(simpleCommand ? { simpleCommand } : {}),
    source,
    createdAt,
    updatedAt: now,
    ok: metrics.ok ?? null,
    pieces: metrics.pieces ?? null,
    maxLen: metrics.maxLen ?? null,
    genMs: metrics.genMs ?? null,
    svgBytes: new TextEncoder().encode(svg).byteLength,
    restarts: metrics.restarts ?? null,
    backtracks: metrics.backtracks ?? null,
    aborted: metrics.aborted ?? false,
    stuck: metrics.stuck ?? null,
  }
  Deno.writeTextFileSync(join(dir, `${id}.svg`), svg)
  Deno.writeTextFileSync(metaFile, JSON.stringify(meta, null, 2))
  return meta
}

/**
 * Removes one board (svg + json). Returns false when there was nothing to
 * remove. A size directory left empty is removed too, so the list does not
 * keep an empty size. Names are validated: they come straight from a URL.
 */
export function deleteBoard(size: string, id: string): boolean {
  if (!/^\d+x\d+$/.test(size) || !/^[\w-]+$/.test(id)) throw new Error(`invalid board name ${size}/${id}`)
  const dir = join(boardsDir(), size)
  let removed = false
  for (const ext of ['.svg', '.json']) {
    const file = join(dir, id + ext)
    if (exists(file)) {
      Deno.removeSync(file)
      removed = true
    }
  }
  if (exists(dir) && [...Deno.readDirSync(dir)].length === 0) Deno.removeSync(dir)
  return removed
}

/** Sizes ascending by cell count, boards newest first within a size. */
export function listBoards(): BoardSize[] {
  const root = boardsDir()
  if (!exists(root)) return []
  const sizes: BoardSize[] = []
  for (const entry of Deno.readDirSync(root)) {
    const m = /^(\d+)x(\d+)$/.exec(entry.name)
    if (!m || !entry.isDirectory) continue
    const dir = join(root, entry.name)
    const boards: BoardMeta[] = []
    for (const f of Deno.readDirSync(dir)) {
      if (!f.name.endsWith('.json')) continue
      if (!exists(join(dir, f.name.slice(0, -5) + '.svg'))) continue
      const meta = readMeta(join(dir, f.name))
      if (meta) boards.push(meta)
    }
    if (!boards.length) continue
    boards.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const W = Number(m[1]), H = Number(m[2])
    sizes.push({ size: entry.name, W, H, cells: W * H, boards })
  }
  sizes.sort((a, b) => a.cells - b.cells || a.W - b.W)
  return sizes
}
