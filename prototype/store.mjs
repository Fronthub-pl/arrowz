// Store of generated boards: prototype/boards/<W>x<H>/<id>.svg + <id>.json.
// Shared by the CLI (carve.mjs --svg) and the lab server. The directory is
// gitignored — a 1000×1000 board is tens of MB, and the command in the meta
// reproduces any board.
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, existsSync, unlinkSync, rmdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardId } from './command.mjs'

export function boardsDir() {
  return process.env.ARROWZ_BOARDS_DIR || join(dirname(fileURLToPath(import.meta.url)), 'boards')
}

export function saveBoard({ svg, params, view, command, simpleCommand, metrics = {}, source }) {
  const id = boardId(params)
  const size = `${params.W}x${params.H}`
  const dir = join(boardsDir(), size)
  mkdirSync(dir, { recursive: true })
  // The same id means the same board (the id hashes the parameters). An
  // overwrite — recolouring in the lab, regenerating from the CLI — keeps the
  // original createdAt, so the board stays in its place in the list, and
  // records the write in updatedAt.
  const now = new Date().toISOString()
  const metaFile = join(dir, `${id}.json`)
  let createdAt = now
  if (existsSync(metaFile)) {
    try { createdAt = JSON.parse(readFileSync(metaFile, 'utf8')).createdAt ?? now } catch { /* broken entry: start over */ }
  }
  const meta = {
    id, W: params.W, H: params.H, seed: params.seed, params, view, command, ...(simpleCommand ? { simpleCommand } : null), source,
    createdAt, updatedAt: now,
    ok: metrics.ok ?? null, pieces: metrics.pieces ?? null, maxLen: metrics.maxLen ?? null,
    genMs: metrics.genMs ?? null, svgBytes: Buffer.byteLength(svg),
  }
  writeFileSync(join(dir, `${id}.svg`), svg)
  writeFileSync(metaFile, JSON.stringify(meta, null, 2))
  return meta
}

/**
 * Removes one board (svg + json). Returns false when there was nothing to
 * remove. A size directory left empty is removed too, so the list does not
 * keep an empty size. Names are validated: they come straight from a URL.
 */
export function deleteBoard(size, id) {
  if (!/^\d+x\d+$/.test(size) || !/^[\w-]+$/.test(id)) throw new Error(`invalid board name ${size}/${id}`)
  const dir = join(boardsDir(), size)
  let removed = false
  for (const ext of ['.svg', '.json']) {
    const file = join(dir, id + ext)
    if (existsSync(file)) { unlinkSync(file); removed = true }
  }
  if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir)
  return removed
}

/** Sizes ascending by cell count, boards newest first within a size. */
export function listBoards() {
  const root = boardsDir()
  if (!existsSync(root)) return []
  const sizes = []
  for (const name of readdirSync(root)) {
    const m = /^(\d+)x(\d+)$/.exec(name)
    if (!m) continue
    const dir = join(root, name)
    if (!statSync(dir).isDirectory()) continue
    const boards = []
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      if (!existsSync(join(dir, f.slice(0, -5) + '.svg'))) continue
      try { boards.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))) } catch { /* broken entry */ }
    }
    if (!boards.length) continue
    boards.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const W = Number(m[1]), H = Number(m[2])
    sizes.push({ size: name, W, H, cells: W * H, boards })
  }
  sizes.sort((a, b) => a.cells - b.cells || a.W - b.W)
  return sizes
}
