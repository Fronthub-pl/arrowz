// Store of generated boards: packages/cli/boards/<W>x<H>/<id>.board.json + <id>.json,
// plus <id>.svg when a preview was asked for. The id is the board's layout hash
// (`sha256-<64 hex>`): one arrangement of arrows has one set of files, whatever
// seeds and parameters carved it, and its meta lists them as recipes (design:
// docs/superpowers/specs/2026-09-15-layout-hash-design.md). Shared by the CLI
// (carve.ts) and the store server. The directory is gitignored — a 1000×1000
// board file is about a megabyte, and the commands in the meta reproduce it.
import { dirname, fromFileUrl, join } from '@std/path'
import type { BoardMeta, BoardSize, Recipe, StoreRequest, View } from '@arrowz/engine'
import { decodeBoard, defaultParams, layoutHash } from '@arrowz/engine'
import { boardId, DEFAULT_VIEW, VIEW_VERSION } from '@arrowz/engine/command'

/** The wire contract plus the two fields only the CLI sends. */
export interface SaveInput extends StoreRequest {
  /** The SVG preview. Without it no preview is kept: one left by an earlier save of this layout is removed. */
  svg?: string
  metrics?: StoreRequest['metrics'] & { aborted?: boolean }
}

/** What a save wrote, and what it found. */
export interface SaveResult {
  meta: BoardMeta
  /** A meta for this layout was already on disk. */
  layoutExisted: boolean
  /** One of its recipes had these parameters, and this save replaced it. */
  recipeExisted: boolean
}

/** The only file names the store lists or deletes. */
const LAYOUT_ID = /^sha256-[0-9a-f]{64}$/

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
 * A stored view with the fields a later knob added filled in. A meta written
 * before `VIEW_VERSION` stored 0 for an automatic head height, a mode that no
 * longer exists, so there a 0 reads as the default; from the version on it is
 * literal, as the CLI's `--arrow-height=0` is.
 */
function fillView(view: View, versioned: boolean): View {
  return {
    ...DEFAULT_VIEW,
    ...view,
    ...(versioned || view?.headHeight ? {} : { headHeight: DEFAULT_VIEW.headHeight }),
  }
}

/**
 * The JSON of a stored layout, or null when the file is missing, broken or not
 * an object. A board saved before a knob existed lacks it in params and view:
 * the missing fields take the engine defaults here, at the boundary, so every
 * reader — the page, buildCommand — sees a complete Params and View, in the
 * top level and in every recipe. A meta without the closing report or without
 * recipes gets its empty values the same way.
 */
function readMeta(file: string): BoardMeta | null {
  try {
    const parsed: unknown = JSON.parse(Deno.readTextFileSync(file))
    if (typeof parsed !== 'object' || parsed === null) return null
    const meta = parsed as BoardMeta
    const sources: Recipe[] = Array.isArray(meta.sources) ? meta.sources : []
    const versioned = (meta.viewVersion ?? 1) >= VIEW_VERSION
    return {
      ...meta,
      params: { ...defaultParams(), ...meta.params },
      view: fillView(meta.view, versioned),
      restarts: meta.restarts ?? null,
      backtracks: meta.backtracks ?? null,
      aborted: meta.aborted ?? false,
      stuck: meta.stuck ?? null,
      fingerprint: meta.fingerprint ?? null,
      boardBytes: meta.boardBytes ?? null,
      svg: meta.svg ?? false,
      sources: sources.map((r) => ({
        ...r,
        params: { ...defaultParams(), ...r.params },
        view: fillView(r.view, versioned),
      })),
    }
  } catch {
    return null
  }
}

/**
 * Saves one board under its layout's name. The layout's recipe for these
 * parameters is replaced, or a recipe is added; the board file is written only
 * when the layout is new, so a name keeps one byte sequence and one fingerprint
 * for as long as it is stored (a saved game checks that fingerprint).
 *
 * A figure absent or null in `metrics` is not carried and keeps the stored
 * value — the store server's checkMetrics drops a null as it drops an absent
 * field, and a view edit posts only four figures.
 */
export async function saveBoard(
  { board, svg, params, view, command, metrics = {}, source }: SaveInput,
): Promise<SaveResult> {
  if (board.W !== params.W || board.H !== params.H) {
    throw new Error(`board file is ${board.W}x${board.H}, the params ask for ${params.W}x${params.H}`)
  }
  // The name is worked out here, from the decoded board: no caller's word for
  // it is taken. Nothing a caller sends reaches a path: the size comes from
  // params equal to the decoded board's checked W and H.
  const id = await layoutHash(decodeBoard(board))
  const dir = join(boardsDir(), `${params.W}x${params.H}`)
  Deno.mkdirSync(dir, { recursive: true })
  const now = new Date().toISOString()
  const metaFile = join(dir, `${id}.json`)
  const boardPath = join(dir, `${id}.board.json`)
  const before = readMeta(metaFile)
  const recipeId = boardId(params)
  const replaced = before?.sources.find((r) => r.id === recipeId) ?? null
  const recipe: Recipe = {
    id: recipeId,
    params,
    view,
    command,
    source,
    createdAt: replaced?.createdAt ?? now,
    updatedAt: now,
    genMs: metrics.genMs ?? replaced?.genMs ?? null,
    restarts: metrics.restarts ?? replaced?.restarts ?? null,
    backtracks: metrics.backtracks ?? replaced?.backtracks ?? null,
    aborted: metrics.aborted ?? false,
  }
  const kept = before?.sources ?? []
  const sources = replaced ? kept.map((r) => (r.id === recipeId ? recipe : r)) : kept.concat(recipe)
  const boardText = JSON.stringify(board)
  // A meta that is missing or unreadable means the file beside it, if any, is
  // not vouched for: it is written again, with this save's numbering. A board
  // file that is not there counts as new for the bytes in the same way — the
  // meta has to describe the file that is actually on disk, and listBoards
  // pairs a meta with its board file, so a save that skipped the write would
  // leave a layout nothing lists. `layoutExisted` is unmoved by either: it
  // reports what it documents, that a meta for this layout was already stored.
  const writesFile = before === null || !exists(boardPath)
  // The stored meta whose board file this save leaves alone, if any: its
  // fingerprint and size still describe that file.
  const vouched = writesFile ? null : before
  const file = vouched === null
    ? { fingerprint: board.fingerprint, boardBytes: new TextEncoder().encode(boardText).byteLength }
    : { fingerprint: vouched.fingerprint, boardBytes: vouched.boardBytes }
  const meta: BoardMeta = {
    id,
    W: params.W,
    H: params.H,
    seed: params.seed,
    params,
    view,
    command,
    source,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
    ok: metrics.ok ?? before?.ok ?? null,
    pieces: metrics.pieces ?? before?.pieces ?? null,
    maxLen: metrics.maxLen ?? before?.maxLen ?? null,
    genMs: recipe.genMs,
    fingerprint: file.fingerprint,
    boardBytes: file.boardBytes,
    svg: svg !== undefined,
    restarts: recipe.restarts,
    backtracks: recipe.backtracks,
    aborted: recipe.aborted,
    stuck: metrics.stuck ?? before?.stuck ?? null,
    sources,
    viewVersion: VIEW_VERSION,
  }
  if (writesFile) Deno.writeTextFileSync(boardPath, boardText)
  const svgFile = join(dir, `${id}.svg`)
  if (svg !== undefined) Deno.writeTextFileSync(svgFile, svg)
  else if (exists(svgFile)) Deno.removeSync(svgFile)
  Deno.writeTextFileSync(metaFile, JSON.stringify(meta, null, 2))
  return { meta, layoutExisted: before !== null, recipeExisted: replaced !== null }
}

/**
 * Removes one layout (board file, meta and preview) with every recipe in it.
 * Returns false when there was nothing to remove. A size directory left empty
 * is removed too, so the list does not keep an empty size. Names are
 * validated: they come straight from a URL, and a name that is not a layout
 * hash — a board stored under the old seed names included — is refused.
 */
export function deleteBoard(size: string, id: string): boolean {
  if (!/^\d+x\d+$/.test(size) || !LAYOUT_ID.test(id)) throw new Error(`invalid board name ${size}/${id}`)
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

/** Sizes ascending by cell count, layouts newest first within a size. Only layout-hash names are read. */
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
      const id = f.name.slice(0, -'.json'.length)
      if (!LAYOUT_ID.test(id) || !exists(join(dir, `${id}.board.json`))) continue
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
