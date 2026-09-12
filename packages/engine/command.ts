// Shared command text and board id for the lab (browser) and the CLI
// (carve). Pure: no fs, no DOM, no randomness.
//
// One parser, one spelling per option. An everyday flag (--width, --length,
// --winding, --skeleton) sets a whole bundle of knobs; a knob flag is its
// PARAM_SPEC key in lower case, never hyphenated (--pstraight, --giantspan),
// and a CLI flag is hyphenated (--dry-run, --arrow-width). A knob written on
// the command line is a PIN: it wins over the bundle and pins only itself.
// The lab has to mirror the CLI 1:1, so both sides build and read the text
// with this code.
import type {
  ParamGroup,
  ParamKey,
  Params,
  ParamSpec,
  RuleKey,
  SimpleChoice,
  SvgOptions,
  View,
  ViewNumber,
} from './types.ts'
import { defaultParams, MIX_SHARE, PARAM_SPEC, RULE_REASONS, RULES, validateParams } from './engine.ts'
import { DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED } from './geometry.ts'
import { defaultChoice, exportCell, simpleParams } from './lab-simple.ts'

/** How the CLI is invoked from anywhere inside the repository; the lab prints it and the store records it. */
export const COMMAND_PREFIX = 'deno task carve'

/**
 * An own-property read of one of the dictionaries below. They are plain object
 * literals, so a key that came from the command line would otherwise reach
 * Object.prototype: `--start=constructor` used to read a native function and
 * take it for a word. A key from outside must find an own property or nothing.
 */
function own<T>(dict: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(dict, key) ? dict[key] : undefined
}

/** A knob flag whose value may also be a word: the word and the number it stores. */
const WORDS: Partial<Record<ParamKey, Record<string, number>>> = {
  Lmax: { auto: 0 },
  maxBack: { auto: 200 },
  giantStep: { random: 0 },
  giantSpacing: { off: 1 },
}

/**
 * The `--start` surface: the one flag that writes two stored knobs. Each word
 * stores a pair of them; a number stores the mixing share itself, taken from
 * the range below. The lab builds its own start control from this table, so
 * the two surfaces cannot offer different values.
 */
export const START: Readonly<{
  words: Readonly<Record<string, Readonly<{ headBias: number; mix: number }>>>
  mix: Readonly<{ min: number; max: number }>
}> = {
  words: {
    layers: { headBias: -1, mix: -1 },
    random: { headBias: 0, mix: -1 },
    tunnels: { headBias: 1, mix: -1 },
  },
  mix: MIX_SHARE,
}

/** Spellings that were dropped, and what to use instead; each is refused by name. */
const RETIRED: Record<string, string> = {
  advanced: 'the CLI has one mode now; drop --advanced',
  board: 'a board file is always written; drop --board',
  straight: 'use --winding=R (0 = straightest) or the knob --pstraight=R',
  stroke: 'use --line=R',
  lineweight: 'use --line=R',
  headwidth: 'use --arrow-width=R',
  arrowwidth: 'use --arrow-width=R',
  headheight: 'use --arrow-height=R',
  arrowheight: 'use --arrow-height=R',
  colorized: 'use --colored',
  w: 'use --width=N',
  h: 'use --height=N',
  lateral: 'use --wlateral=R',
  absorb: 'use --absorblimit=N',
  giantspacepen: 'the spacing strength is fixed now; use --giantspacing=off|2|3',
  headbias: 'use --start=layers|random|tunnels',
  mix: `use --start=${MIX_SHARE.min}..${MIX_SHARE.max} (or layers|random|tunnels to turn mixing off)`,
}

// The size and the seed are knobs in PARAM_SPEC (they are stored and hashed),
// but on the command line they are everyday flags: --width, --height, --seed.
const EVERYDAY_KEYS = new Set<ParamKey>(['W', 'H', 'seed'])

const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))

/** A knob's spec; every key used here comes from PARAM_SPEC, so a miss is a programming error. */
function specOf(key: ParamKey): ParamSpec {
  const s = specByKey.get(key)
  if (!s) throw new Error(`unknown parameter ${key}`)
  return s
}

/** The flag that writes a knob: the everyday spelling for the size and the seed, the key otherwise. */
function flagOf(key: ParamKey): string {
  if (key === 'W') return '--width'
  if (key === 'H') return '--height'
  return `--${key.toLowerCase()}`
}

/** The knob flags a value can be written on: every key except the two behind --start. */
const KEY_BY_FLAG = new Map<string, ParamKey>(
  PARAM_SPEC.filter((s) => s.surface !== 'start' && !EVERYDAY_KEYS.has(s.key))
    .map((s) => [s.key.toLowerCase(), s.key]),
)

/** Rows of the knob table, and so knob flags: one per key, with the two behind --start merged into one. */
const KNOB_FLAGS = PARAM_SPEC.filter((s) => s.surface !== 'start').length + 1

/** The number a word stands for, or null when the knob has no such word. */
function wordValue(key: ParamKey, raw: string): number | null {
  const words = WORDS[key]
  if (words === undefined) return null
  return own(words, raw) ?? null
}

/**
 * The word a knob's value is spelled with, or null when it has none:
 * `wordFor('Lmax', 0)` is 'auto'. The table itself stays private, so the lab
 * shows the word beside a field without a second list of its own.
 */
export function wordFor(key: ParamKey, value: number): string | null {
  for (const [word, n] of Object.entries(WORDS[key] ?? {})) if (n === value) return word
  return null
}

/** The words a knob accepts beside a number, for an error message and the help. */
function wordsOf(key: ParamKey): string[] {
  return Object.keys(WORDS[key] ?? {})
}

/** A finite number, or null when the text is missing or is not one. */
function numberOf(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Whether the two knobs behind --start are both at their defaults. */
function isDefaultStart(params: Params): boolean {
  return PARAM_SPEC.every((s) => s.surface !== 'start' || params[s.key] === s.def)
}

/**
 * How `--start` spells the pair it writes. A mix at or above 0 is the mixing
 * share itself; otherwise the pair is one of the three words. The last line is
 * for a pair that is neither: `validateParams` refuses such a pair (the
 * `startPair` rule), and the lab still calls this on unvalidated state, so the
 * number is printed as it is rather than silently becoming another board.
 */
function startFlag(params: Params): string {
  if (params.mix >= 0) return `--start=${params.mix}`
  for (const [word, v] of Object.entries(START.words)) {
    if (v.headBias === params.headBias && v.mix === params.mix) return `--start=${word}`
  }
  return `--start=${params.headBias}`
}

/**
 * How one knob is written on the command line: the flag and the word or the
 * number it takes. `headBias` and `mix` share the flag `--start`, so the whole
 * set is needed to spell either of them. The one place a word is chosen, so
 * the command text, the help and the CLI's notes cannot drift apart.
 */
export function knobFlag(params: Params, key: ParamKey): string {
  if (specOf(key).surface === 'start') return startFlag(params)
  const value = params[key]
  return `${flagOf(key)}=${wordFor(key, value) ?? value}`
}

// headWidth: arrowhead width in cells, 0 = automatic (from the stroke).
// headHeight: arrowhead height in cells, always literal; the default is the
// engine's own, so this view, toSvg and the board element cannot drift apart.
export const DEFAULT_VIEW: View = {
  cell: 12,
  stroke: 0.5,
  headWidth: 0,
  headHeight: DEFAULT_HEAD_HEIGHT,
  colored: false,
  top: 0,
  rounded: DEFAULT_ROUNDED,
}

/**
 * The SvgOptions a view implies: every field of the view that `toSvg` reads,
 * under the name `toSvg` reads it by — `View.stroke` is `SvgOptions.strokeRatio`.
 *
 * The one place the translation lives. Naming the fields by hand at each call
 * site is how `--sharp` and the lab's rounding checkbox came to be parsed,
 * printed and stored while the drawing never changed: a field added to `View`
 * was silently dropped on the way to `toSvg`. `voids` has no home in a view,
 * so callers that need it spread it over the result.
 */
export function svgOptions(view: View): SvgOptions {
  return {
    cell: view.cell,
    colored: view.colored,
    strokeRatio: view.stroke,
    headWidth: view.headWidth,
    headHeight: view.headHeight,
    top: view.top,
    rounded: view.rounded,
  }
}

/** One line of a flag list in --help: the flag itself and its description. */
type FlagRow = readonly [string, string]

// The flags the CLI reads that are not knobs. Kept next to the parser so that
// --help and the parser cannot drift apart.
const EVERYDAY_FLAGS: readonly FlagRow[] = [
  ['--width=N', 'board width in cells (required)'],
  ['--height=N', 'board height in cells (required)'],
  ['--seed=N', 'seed of the board (default 7)'],
  ['--length=R', 'piece length, 0 = very short, 1 = very long (default 0.75)'],
  ['--winding=R', 'line shape, 0 = straightest, 1 = most winding (default 0.5)'],
  ['--skeleton', 'a skeleton of long pieces first'],
  [
    '--randomized',
    'draw each bundle afresh inside the measured ranges; not reproducible, the board meta keeps the full command',
  ],
]
const OUTPUT_FLAGS: readonly FlagRow[] = [
  ['(no mode)', 'one board file into packages/cli/boards/ (ARROWZ_BOARDS_DIR) with its meta, no picture'],
  ['--svg[=path]', 'the same, plus an SVG preview in the store, and a copy at path'],
  ['--dry-run', 'one board, nothing written: one JSON line on stdout'],
  ['--count=N', 'N closed boards on the seeds from --seed up; one that does not close is skipped'],
  ['--max-seeds=M', 'with --count: give up after M seeds (default 2 x N)'],
  ['--help, -h', 'this text; --help=knobs adds the table of every knob'],
]
const PICTURE_FLAGS: readonly FlagRow[] = [
  ['--cell=N', 'cell size in px (default: about 1600 px on the longer side)'],
  ['--line=R', `line width as a fraction of the cell (default ${DEFAULT_VIEW.stroke})`],
  ['--arrow-width=R|auto', 'arrowhead width in cells (default auto, from the line width)'],
  ['--arrow-height=R', `arrowhead height in cells (default ${DEFAULT_VIEW.headHeight})`],
  ['--colored', 'a different colour for every piece'],
  ['--sharp', 'square corners and a square tail (default: rounded)'],
  ['--top=N', 'highlight the N longest pieces and print their stats'],
]

/** The flags a rule names: the two knobs behind --start have one flag between them, so it is listed once. */
function ruleFlags(keys: readonly ParamKey[]): string[] {
  const out: string[] = []
  for (const key of keys) {
    const flag = specOf(key).surface === 'start' ? '--start' : flagOf(key)
    if (!out.includes(flag)) out.push(flag)
  }
  return out
}

/** A cell of the knob table; every row is built with one cell per column, so a gap is a programming error. */
function cellAt(row: readonly string[], i: number): string {
  const c = row[i]
  if (c === undefined) throw new Error(`knob table row has no column ${i}`)
  return c
}

/** Whether a rule refuses this knob at this value, every other knob standing at its default. */
function refusedAlone(key: ParamKey, value: number): boolean {
  const p = defaultParams()
  p[key] = value
  return validateParams(p).length > 0
}

/**
 * The values a knob flag takes. Its words come first, then the numbers it
 * really accepts: the range starts at the first value no word spells and no
 * rule refuses, so `--lmax` prints auto|17..5000 (auto is 0, and lmaxHole
 * refuses 1..16) and `--maxback` prints auto|50..1000. A knob the lab draws as
 * a list of values prints that list, because that is what its flag takes:
 * `--giantspacing=off|2|3`, not the 1..3 behind it.
 *
 * Joining the words to the raw bounds is what printed ranges the tool refuses.
 */
function rangeText(key: ParamKey): string {
  const s = specOf(key)
  if (s.control?.kind === 'choice') return s.control.choices.map((c) => c.word).join('|')
  let lo = s.min
  while (lo < s.max && (wordFor(key, lo) !== null || refusedAlone(key, lo))) lo = Number((lo + s.step).toFixed(6))
  return [...wordsOf(key), `${lo}..${s.max}`].join('|')
}

/**
 * One row of the knob table: the flag, the values it takes, the step between
 * them, the default spelled the way the flag spells it, and the help line.
 * `--help=knobs` prints it and README.md tabulates it, so the two cannot say
 * different things (readme.test.ts holds them together).
 */
export interface KnobRow {
  group: ParamGroup
  flag: string
  values: string
  label: string
  step: string
  def: string
  help: string
}

/** The knob table: one row per PARAM_SPEC entry, with headBias and mix merged into --start. */
export const KNOB_ROWS: readonly KnobRow[] = (() => {
  const rows: KnobRow[] = []
  let startDone = false
  for (const s of PARAM_SPEC) {
    if (s.surface === 'start') {
      if (startDone) continue
      startDone = true
      rows.push({
        group: s.group,
        flag: '--start',
        values: `${Object.keys(START.words).join('|')}|${MIX_SHARE.min}..${MIX_SHARE.max}`,
        label: 'where a piece starts, and layer/tunnel mixing',
        step: '-',
        def: 'random',
        help:
          'Where the next piece starts: the shallowest line (layers), anywhere (random) or the deepest (tunnels). ' +
          `A number in ${MIX_SHARE.min}..${MIX_SHARE.max} mixes the two instead: the fraction of pieces that start as tunnels.`,
      })
      continue
    }
    rows.push({
      group: s.group,
      flag: flagOf(s.key),
      values: rangeText(s.key),
      label: s.label,
      step: String(s.step),
      def: String(wordFor(s.key, s.def) ?? s.def),
      help: s.help,
    })
  }
  return rows
})()

/** The cross-knob rules, each with the flags it is about. */
export const RULE_ROWS: readonly { key: RuleKey; flags: readonly string[]; reason: string }[] = RULES.map((r) => ({
  key: r.key,
  flags: ruleFlags(r.keys),
  reason: RULE_REASONS[r.key],
}))

/**
 * Usage text for --help. The default is the short form: the everyday flags,
 * the modes and the picture. With { knobs: true } the full knob table follows,
 * one row per PARAM_SPEC entry plus the merged --start, with the rules and
 * what a pin costs.
 */
export function helpText({ knobs = false }: { knobs?: boolean } = {}): string {
  const out: string[] = []
  const list = (rows: readonly FlagRow[], indent = '  ') => {
    const w = Math.max(...rows.map(([f]) => f.length))
    for (const [f, text] of rows) out.push(`${indent}${f.padEnd(w)}  ${text}`)
  }
  out.push(`Usage: ${COMMAND_PREFIX} --width=N --height=N [--seed=N] [options] [mode]`)
  out.push('')
  out.push('One board from the everyday choices. The sliders take 0..1; each sets a bundle')
  out.push('of engine knobs, and a knob named on the command line wins over its bundle.')
  out.push('')
  out.push('Everyday:')
  list(EVERYDAY_FLAGS)
  out.push('')
  out.push('Output:')
  list(OUTPUT_FLAGS)
  out.push('')
  out.push('Picture (kept in the meta, drawn by --svg):')
  list(PICTURE_FLAGS)
  out.push('')
  if (!knobs) {
    // Spelled by the same helper the knob table uses: the summary named three
    // ranges in a string literal, and one of them had already drifted.
    const start = [...Object.keys(START.words), `${MIX_SHARE.min}..${MIX_SHARE.max}`].join('|')
    out.push(`Knobs: --lmax=${rangeText('Lmax')}, --start=${start}, --restarts=${rangeText('restarts')},`)
    // Counted off the knob table itself, so the short help cannot promise
    // fewer rows than --help=knobs prints: every row but the three named above.
    const more = KNOB_FLAGS - 3
    out.push(`and ${more} more. A knob flag is its key in lower case, never hyphenated: see --help=knobs.`)
    out.push('')
    out.push(environment())
    return out.join('\n')
  }
  out.push('Knobs. A knob flag is its key in lower case and is never hyphenated; a CLI flag')
  out.push('is hyphenated instead (--dry-run, --max-seeds, --arrow-width). A value outside')
  out.push('the range below, or breaking a rule, is refused before any board is generated.')
  out.push('')
  // One row per knob plus the merged --start: 26 keys and 25 flags, over 5
  // columns. A spread of a list that is neither cells nor pieces.
  const rows: string[][] = KNOB_ROWS.map((r) => [`${r.flag}=${r.values}`, r.label, r.step, r.def, r.help])
  const head: readonly string[] = ['flag', 'knob', 'step', 'default', 'help']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => cellAt(r, i).length)))
  const line = (r: readonly string[]) =>
    '  ' + r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0))).join('  ')
  out.push(line(head))
  let group: ParamGroup | null = null
  KNOB_ROWS.forEach((knob, i) => {
    if (knob.group !== group) {
      group = knob.group
      out.push(`  [${group}]`)
    }
    const r = rows[i]
    if (r) out.push(line(r))
  })
  out.push('')
  const legend = PARAM_SPEC.filter((s) => wordsOf(s.key).length)
    .flatMap((s) => wordsOf(s.key).map((word) => `${flagOf(s.key)}=${word} is ${WORDS[s.key]?.[word]}`))
  // The picture flags are not knobs, so --arrow-width cannot live in WORDS
  // (see parseArgs); its word belongs in the same legend all the same.
  legend.push(`--arrow-width=auto is ${DEFAULT_VIEW.headWidth}`)
  out.push(`A word in a range spells one number: ${legend.join(', ')}.`)
  out.push('')
  out.push('Rules (checked together with the ranges):')
  list(RULE_ROWS.map((r): FlagRow => [`${r.key} (${r.flags.join(', ')})`, r.reason]))
  out.push('')
  out.push('Pinning. An everyday flag sets a bundle: --length sets the two share knobs,')
  out.push('--winding the four shape knobs, --skeleton the five skeleton knobs, and every')
  out.push('board gets the difficulty baseline. A knob you name yourself is pinned: it')
  out.push('keeps its value while the rest of its bundle is still chosen (and, with')
  out.push('--randomized, still drawn) around it. The safe ranges were measured as whole')
  out.push('bundles, so a half-pinned bundle stays inside the envelope but is no longer')
  out.push('covered by the promise that every everyday combination closes.')
  out.push('')
  out.push(environment())
  return out.join('\n')
}

/** The environment variables, named the same way in both help texts. */
function environment(): string {
  return [
    'Environment: ARROWZ_BOARDS_DIR (board store), CARVE_TRACE=1 (progress on stderr), GIANT_DEBUG=1,',
    'CARVE_TIMEOUT_S=N (abort after N seconds; the board carved so far is stored as not closed).',
  ].join('\n')
}

/** Command text reproducing the board for the given parameters and view. */
export function buildCommand(params: Params, view: Partial<View> = {}): string {
  // A view without a cell size is drawn at the size the CLI picks for the
  // board, so the everyday command carries no --cell at all.
  const fit = exportCell(params.W, params.H)
  const v: View = { ...DEFAULT_VIEW, cell: fit, ...view }
  const parts = [COMMAND_PREFIX, `--width=${params.W}`, `--height=${params.H}`, `--seed=${params.seed}`]
  let startDone = false
  for (const s of PARAM_SPEC) {
    if (EVERYDAY_KEYS.has(s.key)) continue
    if (s.surface === 'start') {
      // One flag writes both stored knobs, so it is printed once, in their place.
      if (startDone) continue
      startDone = true
      if (!isDefaultStart(params)) parts.push(startFlag(params))
      continue
    }
    // A Params has every knob, so the old "is it there at all" guard is gone.
    if (params[s.key] !== s.def) parts.push(knobFlag(params, s.key))
  }
  if (v.cell !== fit) parts.push(`--cell=${v.cell}`)
  if (v.stroke !== DEFAULT_VIEW.stroke) parts.push(`--line=${v.stroke}`)
  if (v.headWidth > 0) parts.push(`--arrow-width=${v.headWidth}`)
  if (v.headHeight !== DEFAULT_VIEW.headHeight) parts.push(`--arrow-height=${v.headHeight}`)
  if (v.colored) parts.push('--colored')
  if (v.top > 0) parts.push(`--top=${v.top}`)
  if (!v.rounded) parts.push('--sharp')
  return parts.join(' ')
}

/** What one call of the CLI asked for: the everyday choice, the knobs it pinned, the view and the modes. */
export interface ParsedArgs {
  params: Params
  view: View
  /** Knob keys written on the command line, in the order they appeared. */
  pins: ParamKey[]
  choice: SimpleChoice & { random: boolean }
  rest: string[]
  errors: string[]
}

/** Where an everyday number lands in the choice. */
const EVERYDAY_NUMBER = new Map<string, 'W' | 'H' | 'seed' | 'lengths' | 'shape'>([
  ['width', 'W'],
  ['height', 'H'],
  ['seed', 'seed'],
  ['length', 'lengths'],
  ['winding', 'shape'],
])
/** The two everyday numbers that are slider positions, and so bounded by 0..1. */
const SLIDERS = new Set(['length', 'winding'])
/** The two everyday numbers that are knobs of their own, and so bounded by their own spec. */
const SIZE_KEYS = new Map<string, ParamKey>([['width', 'W'], ['height', 'H']])
/** Where a picture number lands in the view; the switches (--colored, --sharp) are read on their own. */
const VIEW_NUMBER = new Map<string, ViewNumber>([
  ['cell', 'cell'],
  ['line', 'stroke'],
  ['arrow-width', 'headWidth'],
  ['arrow-height', 'headHeight'],
  ['top', 'top'],
])

/** The flag that writes each picture number, the other half of VIEW_NUMBER. */
export const VIEW_FLAG: Readonly<Record<ViewNumber, string>> = {
  cell: 'cell',
  stroke: 'line',
  headWidth: 'arrow-width',
  headHeight: 'arrow-height',
  top: 'top',
}

/**
 * What each picture number may be. The bounds are the drawing's own, not the
 * lab's: the lab's fields are deliberately narrower (a cell of 1..40, a line
 * of 0.2..0.9), while the CLI also draws the pictures README shows, an
 * arrowhead of 2 squares and a tip of no height among them. What has to hold
 * is the direction that matters for the mirror — every value the lab can
 * reach is a value the CLI takes — and `carve.test.ts` reads `lab.html` to
 * check exactly that.
 *
 * `whole` marks the two flags the help spells `N`: a picture measured in
 * pixels or in pieces cannot have a fraction. The other three are ratios of a
 * square, where the fraction is the point.
 */
export const VIEW_RANGE: Readonly<Record<ViewNumber, Readonly<{ min: number; max: number; whole: boolean }>>> = {
  // A square smaller than a pixel is not a picture; 200 px on a 1000-square
  // side is a 200 000 px drawing, past what a viewer opens.
  cell: { min: 1, max: 200, whole: true },
  // A line of no width draws nothing; past 2 it is twice its own square.
  stroke: { min: 0.05, max: 2, whole: false },
  // 0 is the automatic width, from the line; README's biggest head is 2.
  headWidth: { min: 0, max: 3, whole: false },
  // 0 is a tip of no height at all, which README shows on purpose.
  headHeight: { min: 0, max: 3, whole: false },
  // 0 is no highlight; the list prints one line per piece, so it stays short.
  top: { min: 0, max: 1000, whole: true },
}
/** Mode flags: not the parser's business, handed to the CLI untouched. */
const MODE_FLAGS = new Set(['svg', 'dry-run', 'count', 'max-seeds', 'help'])

/**
 * Splits argv into the everyday choice, the knobs it pins, the view, the mode
 * flags (rest) and a list of errors: a missing size, a size that is not a
 * whole number inside its range, a slider outside 0..1, a value that is
 * neither a word nor a number, a value on a switch, a token that is not a
 * flag at all, a retired spelling, an unknown flag.
 *
 * Pure, and unrandomised on purpose: `params` is the set the choice gives with
 * the pins written over it, which is what the lab and --help print. Drawing
 * for --randomized is the caller's job, so that one parse can serve a whole
 * batch of seeds.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const choice: SimpleChoice & { random: boolean } = { ...defaultChoice(), random: false }
  const view: View = { ...DEFAULT_VIEW }
  const pins: ParamKey[] = []
  const pinned: Partial<Record<ParamKey, number>> = {}
  const rest: string[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  const pin = (key: ParamKey, value: number) => {
    if (!pins.includes(key)) pins.push(key)
    pinned[key] = value
  }
  // A switch is on or off, so a value on one says nothing the switch can
  // carry: --skeleton=off used to turn the skeleton ON, like --colored=0 the
  // colours. Refused by name instead.
  const switchOn = (a: string, raw: string | null): boolean => {
    if (raw === null) return true
    errors.push(`${a} takes no value`)
    return false
  }
  for (const a of argv) {
    // -h is the one flag written with a single dash, and it is a mode flag.
    if (a === '-h') {
      rest.push(a)
      continue
    }
    // A token that is not a flag used to go into rest, where no mode reader
    // ever looked at it: silently ignored input, which is what exit 2 is for.
    if (!a.startsWith('--')) {
      errors.push(`unexpected argument: ${a}`)
      continue
    }
    const eq = a.indexOf('=')
    const name = (eq < 0 ? a.slice(2) : a.slice(2, eq)).toLowerCase()
    const raw = eq < 0 ? null : a.slice(eq + 1)
    seen.add(name) // given, even if the value is bad: that is its own error
    const retired = own(RETIRED, name)
    if (retired !== undefined) {
      errors.push(`--${name} is gone: ${retired}`)
      continue
    }
    if (MODE_FLAGS.has(name)) {
      rest.push(a)
      continue
    }
    if (name === 'start') {
      const word = raw === null ? undefined : own(START.words, raw)
      if (word !== undefined) {
        pin('headBias', word.headBias)
        pin('mix', word.mix)
        continue
      }
      const share = `${START.mix.min}..${START.mix.max}`
      const n = numberOf(raw)
      if (n === null) {
        errors.push(`${a} is not ${Object.keys(START.words).join(', ')} and not a number in ${share}`)
        continue
      }
      if (n < START.mix.min || n > START.mix.max) {
        errors.push(`${a} is outside ${share}`)
        continue
      }
      // Mixing on: the share is the number, and where a piece starts is left
      // to it, exactly as the stored pair says.
      pin('headBias', 0)
      pin('mix', n)
      continue
    }
    if (name === 'skeleton') {
      if (switchOn(a, raw)) choice.skeleton = 'on'
      continue
    }
    if (name === 'randomized') {
      if (switchOn(a, raw)) choice.random = true
      continue
    }
    const field = EVERYDAY_NUMBER.get(name)
    if (field) {
      const n = numberOf(raw)
      if (n === null) {
        errors.push(`${a} is not a number`)
        continue
      }
      if (SLIDERS.has(name) && (n < 0 || n > 1)) {
        errors.push(`${a} is outside 0..1`)
        continue
      }
      // The size is a knob, and normalizeChoice rounds and clamps it for the
      // lab (a URL hash, a stored board). The clamp has to stay there, so the
      // refusal belongs here: --width=2000 used to give a 1000-wide board and
      // exit 0, while --seed=1.5 was refused by the envelope.
      const sizeKey = SIZE_KEYS.get(name)
      if (sizeKey) {
        const s = specOf(sizeKey)
        if (!Number.isInteger(n)) {
          errors.push(`${a} is not a whole number`)
          continue
        }
        if (n < s.min || n > s.max) {
          errors.push(`${a} is outside ${s.min}..${s.max}`)
          continue
        }
      }
      choice[field] = n
      continue
    }
    const key = KEY_BY_FLAG.get(name)
    if (key) {
      const word = raw === null ? null : wordValue(key, raw)
      const n = word ?? numberOf(raw)
      if (n === null) {
        const words = wordsOf(key)
        errors.push(`${a} is not a number${words.length ? ` and not ${words.join(' or ')}` : ''}`)
        continue
      }
      pin(key, n)
      continue
    }
    if (name === 'colored') {
      if (switchOn(a, raw)) view.colored = true
      continue
    }
    if (name === 'sharp') {
      if (switchOn(a, raw)) view.rounded = false
      continue
    }
    const field2 = VIEW_NUMBER.get(name)
    if (field2) {
      // The fifth word of the legend, and the only one outside WORDS: that
      // table is keyed by ParamKey, and the view is not a knob. Both sides of
      // the pair live here — the word read in, the word printed by helpText.
      const n = name === 'arrow-width' && raw === 'auto' ? DEFAULT_VIEW.headWidth : numberOf(raw)
      if (n === null) {
        errors.push(`${a} is not a number`)
        continue
      }
      const r = VIEW_RANGE[field2]
      if (r.whole && !Number.isInteger(n)) {
        errors.push(`${a} is not a whole number`)
        continue
      }
      if (n < r.min || n > r.max) {
        errors.push(`${a} is outside ${r.min}..${r.max}`)
        continue
      }
      view[field2] = n
      continue
    }
    errors.push(`unknown flag --${name}; see --help`)
  }
  const missing = ['width', 'height'].filter((name) => !seen.has(name)).map((name) => `missing --${name}`)
  // The picture is drawn to a fixed size unless the caller asked for a cell.
  if (!seen.has('cell') && Number.isFinite(choice.W) && Number.isFinite(choice.H)) {
    view.cell = exportCell(choice.W, choice.H)
  }
  return { params: simpleParams(choice, null, pinned), view, pins, choice, rest, errors: [...missing, ...errors] }
}

/**
 * Board id: seed plus a hash of the engine parameters. View options are not
 * included — the same board in colour overwrites the same slot. The same
 * command in the browser and in the CLI therefore lands in the same file,
 * which doubles as a determinism check of both runtimes.
 */
export function boardId(params: Params): string {
  const subset: Partial<Record<ParamKey, number>> = {}
  for (const s of PARAM_SPEC) subset[s.key] = params[s.key]
  return `seed${params.seed}-${fnv1a(JSON.stringify(subset))}`
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
