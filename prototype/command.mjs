// Shared command text and board id for the lab (browser) and carve.mjs
// (Node). Pure JS: no fs, no DOM.
//
// The command is the canonical way to invoke carve.mjs: flag = PARAM_SPEC key
// in lower case, defaults from the engine. The lab has to mirror the CLI 1:1,
// so both sides build and read the text with this code.
import { defaultParams, PARAM_SPEC, RULE_REASONS, RULES } from './engine.mjs'
import { defaultChoice, exportCell } from './lab-simple.ts'

// Old flag names from rounds 1–7; README examples must keep working.
export const ALIASES = {
  straight: 'pStraight',
  lateral: 'wLateral',
  absorb: 'absorbLimit',
  giantspacepen: 'giantSpacePenalty',
}

const KEY_BY_FLAG = new Map(PARAM_SPEC.map((s) => [s.key.toLowerCase(), s.key]))
for (const [alias, key] of Object.entries(ALIASES)) KEY_BY_FLAG.set(alias, key)

// headWidth / headHeight: arrowhead size in cells, 0 = automatic (from the stroke).
export const DEFAULT_VIEW = { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 }

// Mode and view flags read by carve.mjs (not engine parameters). Kept next to
// the parser so that --help and the parser cannot drift apart.
const MODE_FLAGS = [
  ['--svg[=path]', 'one board into prototype/boards/ (ARROWZ_BOARDS_DIR), plus a copy at path'],
  ['--dry-run', 'one board, nothing written: one JSON line on stdout (alone or next to --svg)'],
  ['(no mode)', 'metrics report per level: Easy 25, Medium 50, Hard 75, Nightmare 100, Extreme 200, Insane 1000'],
  ['--bench=N', 'benchmark instead of the report, N runs per level'],
  ['--runs=N', 'runs per level in the report (default 3)'],
  [
    '--only=<level>',
    'one level only, case-insensitive: --only=easy·sq, --only=hard·pt, or --only=easy with --square/--portrait',
  ],
  ['--mid=N', 'an extra level "Mid" with N cells on the shorter side'],
  ['--square', 'levels as 1:1 boards only'],
  ['--portrait', 'levels as 1:2 boards only'],
  ['--show', 'report: print the first board of each level up to 40 cells wide'],
  ['--help, -h', 'this text'],
]
const VIEW_FLAGS = [
  ['--cell=N', `cell size in px (default ${DEFAULT_VIEW.cell})`],
  ['--stroke=R', `stroke width as a fraction of the cell (default ${DEFAULT_VIEW.stroke})`],
  ['--headwidth=R', 'arrowhead width in cells (default 0 = automatic, from the stroke)'],
  ['--headheight=R', 'arrowhead height in cells (default 0 = automatic, from the stroke)'],
  ['--colored', 'a different colour for every piece'],
  ['--top=N', 'highlight the N longest pieces and print their stats'],
]

// The simple mode: the flags of the simple lab view. Kept next to the parser
// below for the same reason as MODE_FLAGS.
const SIMPLE_FLAGS = [
  ['--width=N', 'board width in cells (required)'],
  ['--height=N', 'board height in cells (required)'],
  ['--length=R', 'piece length, 0 = very short, 1 = very long (default 0.75)'],
  ['--straight=R', 'line shape, 0 = most winding, 1 = straightest (default 0.5)'],
  ['--skeleton', 'a skeleton of long pieces first'],
  ['--seed=N', 'seed of the board (default 7)'],
  [
    '--randomized',
    'draw every knob afresh inside the slider ranges; not reproducible, the board meta keeps the full command',
  ],
  ['--colorized', 'a different colour for every piece'],
  ['--lineweight=R', `stroke width as a fraction of the cell (default ${DEFAULT_VIEW.stroke})`],
  ['--arrowwidth=R', 'arrowhead width in cells (default 0 = automatic, from the stroke)'],
  ['--arrowheight=R', 'arrowhead height in cells (default 0 = automatic, from the stroke)'],
]
const SIMPLE_MODE_FLAGS = [
  ['(no mode)', 'one board into prototype/boards/ (ARROWZ_BOARDS_DIR)'],
  ['--svg=path', 'the same, plus a copy at path'],
  ['--dry-run', 'one board, nothing written: one JSON line on stdout (alone or next to --svg)'],
  ['--advanced', 'every engine knob, the report and the benchmark: see --advanced --help'],
  ['--help, -h', 'this text'],
]

/**
 * Usage text for --help. The default is the simple mode: its flags and modes.
 * With { advanced: true }: modes, one row per PARAM_SPEC knob, rules, aliases.
 */
export function helpText({ advanced = false } = {}) {
  const out = []
  const flagOf = (key) => `--${key.toLowerCase()}`
  const list = (rows, indent = '  ') => {
    const w = Math.max(...rows.map(([f]) => f.length))
    for (const [f, text] of rows) out.push(`${indent}${f.padEnd(w)}  ${text}`)
  }
  if (!advanced) {
    out.push('Usage: node prototype/carve.mjs --width=N --height=N [options] [mode]')
    out.push('')
    out.push('One board from the choices of the simple lab view. The sliders take 0..1; the')
    out.push('engine knobs behind them follow the lab ranges for that position.')
    out.push('')
    out.push('Options:')
    list(SIMPLE_FLAGS)
    out.push('')
    out.push('Modes:')
    list(SIMPLE_MODE_FLAGS)
    out.push('')
    out.push('Environment: ARROWZ_BOARDS_DIR (board store), CARVE_TRACE=1 (progress on stderr).')
    return out.join('\n')
  }
  out.push('Usage: node prototype/carve.mjs --advanced [--<knob>=value ...] [mode] [view options]')
  out.push('')
  out.push('Every knob below is a flag: --<key in lower case>=value. Values outside the')
  out.push('allowed range or breaking a rule are refused before any board is generated.')
  out.push('Without --advanced the CLI takes the simple flags instead: see --help.')
  out.push('')
  out.push('Modes:')
  list(MODE_FLAGS)
  out.push('')
  out.push('View options (--svg and --dry-run):')
  list(VIEW_FLAGS)
  out.push('')
  out.push('Knobs:')
  const rows = PARAM_SPEC.map((
    s,
  ) => [flagOf(s.key), s.label, `${s.min}..${s.max}`, String(s.step), String(s.def), s.help])
  const head = ['flag', 'label', 'range', 'step', 'default', 'help']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (r) => '  ' + r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i]))).join('  ')
  out.push(line(head))
  let group = null
  for (let i = 0; i < rows.length; i++) {
    if (PARAM_SPEC[i].group !== group) {
      group = PARAM_SPEC[i].group
      out.push(`  [${group}]`)
    }
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
  const parts = [
    'node prototype/carve.mjs --advanced --svg',
    `--w=${params.W}`,
    `--h=${params.H}`,
    `--seed=${params.seed}`,
  ]
  for (const s of PARAM_SPEC) {
    if (s.key === 'W' || s.key === 'H' || s.key === 'seed') continue
    if (params[s.key] !== undefined && params[s.key] !== s.def) parts.push(`--${s.key.toLowerCase()}=${params[s.key]}`)
  }
  parts.push(`--cell=${v.cell}`)
  if (v.stroke !== DEFAULT_VIEW.stroke) parts.push(`--stroke=${v.stroke}`)
  if (v.headWidth > 0) parts.push(`--headwidth=${v.headWidth}`)
  if (v.headHeight > 0) parts.push(`--headheight=${v.headHeight}`)
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
    if (!a.startsWith('--')) {
      rest.push(a)
      continue
    }
    const eq = a.indexOf('=')
    const name = (eq < 0 ? a.slice(2) : a.slice(2, eq)).toLowerCase()
    const raw = eq < 0 ? null : a.slice(eq + 1)
    const key = KEY_BY_FLAG.get(name)
    if (key) {
      params[key] = Number(raw)
      continue
    }
    if (name === 'cell' || name === 'stroke' || name === 'top') {
      view[name] = Number(raw)
      continue
    }
    if (name === 'headwidth') {
      view.headWidth = Number(raw)
      continue
    }
    if (name === 'headheight') {
      view.headHeight = Number(raw)
      continue
    }
    if (name === 'colored') {
      view.colored = true
      continue
    }
    rest.push(a)
  }
  return { params, view, rest }
}

// --- the simple mode (no --advanced) ----------------------------------------
// The default way to call carve.mjs takes what the simple lab view takes: a
// size, two slider positions in 0..1, a skeleton switch, a seed, the view and
// a randomise flag. Two-word flags are lower case without a separator, like
// --headwidth. --straight reads the shape slider from its straight end, so
// --straight=1 is the straightest board.

const SIMPLE_NUMBER = new Map([
  ['width', ['choice', 'W']],
  ['height', ['choice', 'H']],
  ['seed', ['choice', 'seed']],
  ['length', ['choice', 'lengths']],
  ['straight', ['choice', 'shape']],
  ['lineweight', ['view', 'stroke']],
  ['arrowwidth', ['view', 'headWidth']],
  ['arrowheight', ['view', 'headHeight']],
])
const SIMPLE_SWITCH = new Map([['skeleton', ['choice', 'skeleton', 'on']], ['randomized', ['choice', 'random', true]], [
  'colorized',
  ['view', 'colored', true],
]])
const SIMPLE_SLIDER = new Set(['length', 'straight'])
// Mode flags carve.mjs reads in the simple mode; anything else is refused.
const SIMPLE_PASS = /^(--svg(=.*)?|--dry-run|--help|-h)$/
const ADVANCED_HINT = 'engine knobs, the report and the benchmark need --advanced'

const round6 = (v) => Number(v.toFixed(6))

/**
 * Splits argv into a simple-view choice (lab-simple.mjs), view options, the
 * mode flags (rest) and a list of errors: a missing size, a slider value
 * outside 0..1, a value that is not a number, an unknown flag.
 */
export function parseSimpleArgs(argv) {
  const choice = { ...defaultChoice(), random: false }
  const view = { ...DEFAULT_VIEW }
  const rest = [], errors = []
  const seen = new Set()
  for (const a of argv) {
    if (!a.startsWith('--') || SIMPLE_PASS.test(a)) {
      rest.push(a)
      continue
    }
    const eq = a.indexOf('=')
    const name = (eq < 0 ? a.slice(2) : a.slice(2, eq)).toLowerCase()
    const raw = eq < 0 ? null : a.slice(eq + 1)
    if (SIMPLE_SWITCH.has(name)) {
      const [target, key, value] = SIMPLE_SWITCH.get(name)
      ;(target === 'choice' ? choice : view)[key] = value
      continue
    }
    if (!SIMPLE_NUMBER.has(name)) {
      errors.push(`unknown flag --${name} (${ADVANCED_HINT})`)
      continue
    }
    const [target, key] = SIMPLE_NUMBER.get(name)
    seen.add(name) // given, even if the value is bad: that is its own error
    const n = raw === null || raw === '' ? NaN : Number(raw)
    if (!Number.isFinite(n)) {
      errors.push(`${a} is not a number`)
      continue
    }
    if (SIMPLE_SLIDER.has(name) && (n < 0 || n > 1)) {
      errors.push(`${a} is outside 0..1`)
      continue
    }
    ;(target === 'choice' ? choice : view)[key] = name === 'straight' ? round6(1 - n) : n
  }
  const missing = ['width', 'height'].filter((name) => !seen.has(name)).map((name) => `missing --${name}`)
  if (Number.isFinite(choice.W) && Number.isFinite(choice.H)) view.cell = exportCell(choice.W, choice.H)
  return { choice, view, rest, errors: [...missing, ...errors] }
}

/** Simple command text for a choice and view: size and seed always, the rest only when off the default. */
export function buildSimpleCommand(choice, view = {}) {
  const d = defaultChoice()
  const v = { ...DEFAULT_VIEW, ...view }
  const parts = ['node prototype/carve.mjs', `--width=${choice.W}`, `--height=${choice.H}`, `--seed=${choice.seed}`]
  if (choice.lengths !== d.lengths) parts.push(`--length=${choice.lengths}`)
  if (choice.shape !== d.shape) parts.push(`--straight=${round6(1 - choice.shape)}`)
  if (choice.skeleton === 'on') parts.push('--skeleton')
  if (choice.random) parts.push('--randomized')
  if (v.stroke !== DEFAULT_VIEW.stroke) parts.push(`--lineweight=${v.stroke}`)
  if (v.headWidth > 0) parts.push(`--arrowwidth=${v.headWidth}`)
  if (v.headHeight > 0) parts.push(`--arrowheight=${v.headHeight}`)
  if (v.colored) parts.push('--colorized')
  return parts.join(' ')
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
