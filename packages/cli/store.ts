// Store of generated boards: packages/cli/boards/<W>x<H>/<id>.board.json + <id>.json,
// plus <id>.svg when a preview was asked for. Shared by the CLI (carve.ts) and
// the lab server. The directory is gitignored — a 1000×1000 board file is about
// a megabyte, and the command in the meta reproduces any board.
import { dirname, fromFileUrl, join } from '@std/path'
import type { BoardFile, BoardMeta, BoardSize, Params, Stuck, View } from '@arrowz/engine'
import { boardId, DEFAULT_VIEW } from '@arrowz/engine/command'
import { defaultParams } from '@arrowz/engine'

export interface SaveInput {
  board: BoardFile
  /** The SVG preview. Without it no preview is kept: one left by an earlier save of this id is removed. */
  svg?: string
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
      // A stored headHeight of 0 meant "automatic", a mode that no longer
      // exists: read it as unset. Every board written before this change
      // carries it, and taken literally they would draw no arrowhead at all.
      //
      // That is no longer the only way a 0 can get here: `--headheight=0` is
      // now accepted literally and on purpose, so a board CAN be saved
      // headless deliberately. The migration cannot tell the two apart and has
      // no expiry date, which costs exactly this: such a board is shown in the
      // library with a head of the default height, while the command stored
      // next to it still says `--headheight=0` and reproduces it headless.
      view: {
        ...DEFAULT_VIEW,
        ...meta.view,
        ...(meta.view?.headHeight ? {} : { headHeight: DEFAULT_VIEW.headHeight }),
      },
      restarts: meta.restarts ?? null,
      backtracks: meta.backtracks ?? null,
      aborted: meta.aborted ?? false,
      stuck: meta.stuck ?? null,
      fingerprint: meta.fingerprint ?? null,
      boardBytes: meta.boardBytes ?? null,
      svg: meta.svg ?? false,
    }
  } catch {
    return null
  }
}

export function saveBoard(
  { board, svg, params, view, command, simpleCommand, metrics = {}, source }: SaveInput,
): BoardMeta {
  if (board.W !== params.W || board.H !== params.H) {
    throw new Error(`board file is ${board.W}x${board.H}, the params ask for ${params.W}x${params.H}`)
  }
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
  const boardText = JSON.stringify(board)
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
    fingerprint: board.fingerprint,
    boardBytes: new TextEncoder().encode(boardText).byteLength,
    svg: svg !== undefined,
    restarts: metrics.restarts ?? null,
    backtracks: metrics.backtracks ?? null,
    aborted: metrics.aborted ?? false,
    stuck: metrics.stuck ?? null,
  }
  Deno.writeTextFileSync(join(dir, `${id}.board.json`), boardText)
  const svgFile = join(dir, `${id}.svg`)
  if (svg !== undefined) Deno.writeTextFileSync(svgFile, svg)
  else if (exists(svgFile)) Deno.removeSync(svgFile)
  Deno.writeTextFileSync(metaFile, JSON.stringify(meta, null, 2))
  return meta
}

/**
 * Removes one board (board file, meta and preview). Returns false when there was nothing to
 * remove. A size directory left empty is removed too, so the list does not
 * keep an empty size. Names are validated: they come straight from a URL.
 */
export function deleteBoard(size: string, id: string): boolean {
  if (!/^\d+x\d+$/.test(size) || !/^[\w-]+$/.test(id)) throw new Error(`invalid board name ${size}/${id}`)
  const dir = join(boardsDir(), size)
  let removed = false
  for (const ext of ['.board.json', '.json', '.svg']) {
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
      if (!f.name.endsWith('.json') || f.name.endsWith('.board.json')) continue
      if (!exists(join(dir, f.name.slice(0, -'.json'.length) + '.board.json'))) continue
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
