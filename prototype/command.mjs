// Shared command text and board id for the lab (browser) and carve.mjs
// (Node). Pure JS: no fs, no DOM.
//
// The command is the canonical way to invoke carve.mjs: flag = PARAM_SPEC key
// in lower case, defaults from the engine. The lab has to mirror the CLI 1:1,
// so both sides build and read the text with this code.
import { PARAM_SPEC, defaultParams } from './engine.mjs'

// Old flag names from rounds 1–7; README examples must keep working.
export const ALIASES = {
  straight: 'pStraight', lateral: 'wLateral', absorb: 'absorbLimit', giantspacepen: 'giantSpacePenalty',
}

const KEY_BY_FLAG = new Map(PARAM_SPEC.map((s) => [s.key.toLowerCase(), s.key]))
for (const [alias, key] of Object.entries(ALIASES)) KEY_BY_FLAG.set(alias, key)

export const DEFAULT_VIEW = { cell: 12, stroke: 0.5, colored: false, top: 0 }

/** Command text reproducing the board for the given parameters and view. */
export function buildCommand(params, view = {}) {
  const v = { ...DEFAULT_VIEW, ...view }
  const parts = ['node prototype/carve.mjs --svg', `--w=${params.W}`, `--h=${params.H}`, `--seed=${params.seed}`]
  for (const s of PARAM_SPEC) {
    if (s.key === 'W' || s.key === 'H' || s.key === 'seed') continue
    if (params[s.key] !== undefined && params[s.key] !== s.def) parts.push(`--${s.key.toLowerCase()}=${params[s.key]}`)
  }
  parts.push(`--cell=${v.cell}`)
  if (v.stroke !== DEFAULT_VIEW.stroke) parts.push(`--stroke=${v.stroke}`)
  if (v.colored) parts.push('--colored')
  if (v.top > 0) parts.push(`--top=${v.top}`)
  return parts.join(' ')
}

/**
 * Splits argv into engine parameters (full set with defaults), view options
 * and the rest — mode flags (--svg, --runs, --bench…) read by carve.mjs.
 */
export function parseArgs(argv) {
  const params = defaultParams()
  const view = { ...DEFAULT_VIEW }
  const rest = []
  for (const a of argv) {
    if (!a.startsWith('--')) { rest.push(a); continue }
    const eq = a.indexOf('=')
    const name = (eq < 0 ? a.slice(2) : a.slice(2, eq)).toLowerCase()
    const raw = eq < 0 ? null : a.slice(eq + 1)
    const key = KEY_BY_FLAG.get(name)
    if (key) { params[key] = Number(raw); continue }
    if (name === 'cell' || name === 'stroke' || name === 'top') { view[name] = Number(raw); continue }
    if (name === 'colored') { view.colored = true; continue }
    rest.push(a)
  }
  return { params, view, rest }
}

/**
 * Board id: seed plus a hash of the engine parameters. View options are not
 * included — the same board in colour overwrites the same slot. The same
 * command in the browser and in Node therefore lands in the same file, which
 * doubles as a determinism check of both runtimes.
 */
export function boardId(params) {
  const subset = {}
  for (const s of PARAM_SPEC) subset[s.key] = params[s.key]
  return `seed${params.seed}-${fnv1a(JSON.stringify(subset))}`
}

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
