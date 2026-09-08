// Shared command text and board id for the lab (browser) and carve.mjs
// (Node). Pure JS: no fs, no DOM.
//
// The command is the canonical way to invoke carve.mjs: flag = PARAM_SPEC key
// in lower case, defaults from the engine. The lab has to mirror the CLI 1:1,
// so both sides build and read the text with this code.
import { PARAM_SPEC, defaultParams, RULES, RULE_REASONS } from './engine.mjs'

// Old flag names from rounds 1–7; README examples must keep working.
export const ALIASES = {
  straight: 'pStraight', lateral: 'wLateral', absorb: 'absorbLimit', giantspacepen: 'giantSpacePenalty',
}

const KEY_BY_FLAG = new Map(PARAM_SPEC.map((s) => [s.key.toLowerCase(), s.key]))
for (const [alias, key] of Object.entries(ALIASES)) KEY_BY_FLAG.set(alias, key)

export const DEFAULT_VIEW = { cell: 12, stroke: 0.5, colored: false, top: 0 }

// Mode and view flags read by carve.mjs (not engine parameters). Kept next to
// the parser so that --help and the parser cannot drift apart.
const MODE_FLAGS = [
  ['--svg[=path]', 'one board into prototype/boards/ (ARROWZ_BOARDS_DIR), plus a copy at path'],
  ['--dry-run', 'one board, nothing written: one JSON line on stdout (alone or next to --svg)'],
  ['(no mode)', 'metrics report per level: Easy 25, Medium 50, Hard 75, Nightmare 100, Extreme 200, Insane 1000'],
  ['--bench=N', 'benchmark instead of the report, N runs per level'],
  ['--runs=N', 'runs per level in the report (default 3)'],
  ['--only=<level>', 'one level only, case-insensitive: --only=easy·sq, --only=hard·pt, or --only=easy with --square/--portrait'],
  ['--mid=N', 'an extra level "Mid" with N cells on the shorter side'],
  ['--square', 'levels as 1:1 boards only'],
  ['--portrait', 'levels as 1:2 boards only'],
  ['--show', 'report: print the first board of each level up to 40 cells wide'],
  ['--help, -h', 'this text'],
]
const VIEW_FLAGS = [
  ['--cell=N', `cell size in px (default ${DEFAULT_VIEW.cell})`],
  ['--stroke=R', `stroke width as a fraction of the cell (default ${DEFAULT_VIEW.stroke})`],
  ['--colored', 'a different colour for every piece'],
  ['--top=N', 'highlight the N longest pieces and print their stats'],
]

/** Usage text for --help: modes, one row per PARAM_SPEC knob, rules, aliases. */
export function helpText() {
  const out = []
  const flagOf = (key) => `--${key.toLowerCase()}`
  const list = (rows, indent = '  ') => {
    const w = Math.max(...rows.map(([f]) => f.length))
    for (const [f, text] of rows) out.push(`${indent}${f.padEnd(w)}  ${text}`)
  }
  out.push('Usage: node prototype/carve.mjs [--<knob>=value ...] [mode] [view options]')
  out.push('')
  out.push('Every knob below is a flag: --<key in lower case>=value. Values outside the')
  out.push('allowed range or breaking a rule are refused before any board is generated.')
  out.push('')
  out.push('Modes:')
  list(MODE_FLAGS)
  out.push('')
  out.push('View options (--svg and --dry-run):')
  list(VIEW_FLAGS)
  out.push('')
  out.push('Knobs:')
  const rows = PARAM_SPEC.map((s) => [flagOf(s.key), s.label, `${s.min}..${s.max}`, String(s.step), String(s.def), s.help])
  const head = ['flag', 'label', 'range', 'step', 'default', 'help']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (r) => '  ' + r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i]))).join('  ')
  out.push(line(head))
  let group = null
  for (let i = 0; i < rows.length; i++) {
    if (PARAM_SPEC[i].group !== group) { group = PARAM_SPEC[i].group; out.push(`  [${group}]`) }
    out.push(line(rows[i]))
  }
  out.push('')
  out.push('Rules (checked together with the ranges):')
  list(RULES.map((r) => [`${r.key} (${r.keys.map(flagOf).join(', ')})`, RULE_REASONS[r.key]]))
  out.push('')
  out.push('Old flag names, still accepted:')
  list(Object.entries(ALIASES).map(([alias, key]) => [`--${alias}`, `same as ${flagOf(key)}`]))
  out.push('')
  out.push('Environment: ARROWZ_BOARDS_DIR (board store), CARVE_TRACE=1 (progress on stderr), GIANT_DEBUG=1.')
  return out.join('\n')
}

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
