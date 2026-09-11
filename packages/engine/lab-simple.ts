// The simple view of the lab: a board size (any width and height the engine
// allows), two sliders (piece length, line shape), a skeleton switch and a
// seed, translated into a full engine parameter set.
//
// A slider position is a wish, not a configuration. Each slider has anchors
// at 0, 0.25, 0.5, 0.75 and 1; an anchor gives every knob it controls a
// RANGE with a canonical value, and positions in between interpolate the
// range. Without a random generator the canonical values are used, so the
// same position always gives the same command; with one, each knob is drawn
// inside its range at that position, so the same position gives a different
// board on every Generate. The ranges are narrower than the engine envelope
// (PARAM_SPEC / RULES): they follow the measurements in the analysis notes,
// and they narrow further with the board size. Knobs a choice does not name
// stay at their defaults — the closing knobs above all, because a random
// backtrack budget turns a jam into minutes of waiting instead of a quick
// restart.
//
// Labels come from the dictionaries (lab-i18n.ts, `simple`); nothing here
// knows the DOM.
import type { ParamKey, Params, ParamSpec, Range, SimpleChoice } from './types.ts'
import { defaultParams, PARAM_SPEC } from './engine.ts'
import { PRESETS } from './lab-presets.ts'

const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))

/** A knob's spec; every key used in this file is a PARAM_SPEC key, so a miss is a programming error. */
function specOf(key: ParamKey): ParamSpec {
  const s = specByKey.get(key)
  if (!s) throw new Error(`unknown parameter ${key}`)
  return s
}

/** One entry of SIMPLE_SIZES: a preset size and the id the lab shows for it. */
type Size = { id: string; W: number; H: number }

/** Every distinct preset size, smallest first — the sizes the ranges are exercised at. */
export const SIMPLE_SIZES: readonly Size[] = (() => {
  const seen = new Map<string, Size>()
  for (const l of PRESETS) {
    for (const o of l.options) {
      const { W, H } = o.params
      // Every preset names a size; a preset without one is a bug in lab-presets.ts.
      if (W === undefined || H === undefined) throw new Error(`preset ${o.id} has no size`)
      const id = `${W}x${H}`
      if (!seen.has(id)) seen.set(id, { id, W, H })
    }
  }
  return [...seen.values()].sort((a, b) => a.W * a.H - b.W * b.H || a.W - b.W)
})()

/** Button choices. */
export const SIMPLE_CHOICES = {
  skeleton: ['off', 'on'],
} as const satisfies { skeleton: readonly SimpleChoice['skeleton'][] }

// A range is { lo, hi, def } drawn uniformly and snapped to the knob step, or
// { pick: [...], def } drawn from a list.
const r = (lo: number, hi: number, def: number): Range => ({ lo, hi, def })

/** The ranges one slider anchor (or one switch position) sets, keyed by PARAM_SPEC key. */
type Anchor = Partial<Record<ParamKey, Range>>

/** Typed Object.keys for an anchor: its keys are PARAM_SPEC keys by construction. */
function anchorKeys(a: Anchor): ParamKey[] {
  return Object.keys(a) as ParamKey[]
}

// Slider anchors, position 0 to 1 in steps of 0.25. The 0.75 anchor of the
// length slider and the 0.5 anchor of the shape slider are the engine
// defaults, so the default choice reproduces defaultParams() exactly.
const LENGTH_ANCHORS: readonly Anchor[] = [
  // very short: almost everything in the short bucket (sum capped at 0.9)
  { wShort: r(0.65, 0.8, 0.75), wMid: r(0.05, 0.15, 0.15) },
  { wShort: r(0.5, 0.7, 0.6), wMid: r(0.1, 0.2, 0.2) },
  { wShort: r(0.15, 0.35, 0.25), wMid: r(0.35, 0.55, 0.45) },
  { wShort: r(0.05, 0.25, 0.2), wMid: r(0, 0.15, 0.08) },
  // very long: the long bucket takes nearly all the weight
  { wShort: r(0, 0.1, 0.05), wMid: r(0, 0.05, 0) },
]

// pStraight is the one knob that jams boards: 0.6 leaves 600×600 unclosed
// while 0.65 and 0.7 close; anticoil above 6 with pStraight below 0.7 jams
// too. The winding end therefore stays at 0.65+ with a low anticoil, and the
// nook rule (warns) does the winding instead — it neutralises the floor.
const SHAPE_ANCHORS: readonly Anchor[] = [
  // straightest: no sideways preference at all
  { pStraight: r(0.98, 1, 1), wLateral: r(0, 1, 0), anticoil: r(1, 6, 6), warns: r(3, 5, 4) },
  { pStraight: r(0.92, 1, 0.95), wLateral: r(0, 3, 1), anticoil: r(1, 6, 6), warns: r(3, 5, 4) },
  { pStraight: r(0.8, 0.9, 0.85), wLateral: r(2, 5, 3), anticoil: r(4, 8, 6), warns: r(3, 6, 4) },
  { pStraight: r(0.65, 0.78, 0.7), wLateral: r(4, 10, 6), anticoil: r(2, 6, 4), warns: r(4, 8, 5) },
  // most winding: the straightness floor, coiling allowed, nooks filled first
  { pStraight: r(0.65, 0.7, 0.65), wLateral: r(8, 14, 10), anticoil: r(1, 4, 2), warns: r(6, 10, 8) },
]
const BIG_SIDE = 600
// Above 600 a side the straightness floor rises to 0.7 on the winding half.
const SHAPE_ANCHORS_BIG: readonly (Anchor | null)[] = [
  null,
  null,
  null,
  { pStraight: r(0.7, 0.78, 0.72) },
  { pStraight: r(0.7, 0.72, 0.7) },
]

export const SIMPLE_SLIDERS = {
  lengths: { anchors: LENGTH_ANCHORS },
  shape: { anchors: SHAPE_ANCHORS, big: SHAPE_ANCHORS_BIG },
} as const

/** The two sliders of the simple view. */
type SliderKey = keyof typeof SIMPLE_SLIDERS

// Dense skeletons (wGiant ≥ 0.13 with step ≤ 7 and span ≥ 100) are the time
// tail of the measurements; these ranges stay below all three.
const SKELETON: Record<SimpleChoice['skeleton'], Anchor> = {
  off: {},
  on: {
    giants: r(3, 6, 4),
    giantStep: r(6, 14, 14),
    giantJitter: r(0.3, 1, 0.6),
    giantSpan: r(10, 40, 30),
    wGiant: r(0, 0.1, 0),
  },
}

// Where pieces start and the probe share change the look without touching
// the closing; drawn in random mode, defaults otherwise. Layers mode (-1)
// starves at a million cells.
const DIFFICULTY: Anchor = { headBias: { pick: [-1, 0, 1], def: 0 }, probe: r(0, 0.3, 0), probeLen: r(6, 40, 12) }
const DIFFICULTY_BIG: Anchor = { headBias: { pick: [0, 1], def: 0 } }

/**
 * Cell size for the exported SVG: 1600 px on the longer side, between 1 and
 * 18 px. The lab and the CLI simple mode share it, so the same choice gives
 * the same file in both.
 */
export function exportCell(W: number, H: number): number {
  return Math.max(1, Math.min(18, Math.round(1600 / Math.max(W, H))))
}

/** The choice that reproduces the engine defaults. */
export function defaultChoice(): SimpleChoice {
  const d = defaultParams()
  return { W: d.W, H: d.H, lengths: 0.75, shape: 0.5, skeleton: 'off', seed: d.seed }
}

// Recipes saved by the button version of the view carry category names.
const OLD_NAMES: Record<SliderKey, Record<string, number>> = {
  lengths: { short: 0.25, medium: 0.5, long: 0.75 },
  shape: { straight: 0.25, wavy: 0.5, winding: 0.75 },
}

/**
 * A choice with every field valid: old category names become slider
 * positions, numbers are clamped into 0..1, the size is clamped into the
 * engine range (an old `size` id such as "100x200" is read when W or H is
 * missing), anything else falls back to the default. The randomise flag
 * rides along.
 */
export function normalizeChoice(raw: unknown): SimpleChoice {
  const d = defaultChoice()
  const src: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const old = typeof src.size === 'string' ? /^(\d+)x(\d+)$/.exec(src.size) : null

  const side = (key: 'W' | 'H', group: number): number => {
    const spec = specOf(key)
    const given = src[key]
    const v = typeof given === 'number' ? given : old ? Number(old[group]) : NaN
    return Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, Math.round(v))) : d[key]
  }

  const slider = (key: SliderKey): number => {
    const v = src[key]
    const named = typeof v === 'string' ? OLD_NAMES[key][v] : undefined
    const n = named ?? (typeof v === 'number' ? v : NaN)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d[key]
  }

  const skeleton = ((): SimpleChoice['skeleton'] => {
    for (const value of SIMPLE_CHOICES.skeleton) if (src.skeleton === value) return value
    return d.skeleton
  })()

  return {
    W: side('W', 1),
    H: side('H', 2),
    lengths: slider('lengths'),
    shape: slider('shape'),
    skeleton,
    seed: typeof src.seed === 'number' ? src.seed : d.seed,
    random: src.random === true,
  }
}

// Interpolates the ranges of two neighbouring anchors, knob by knob.
function lerpRanges(anchors: readonly Anchor[], t: number): Anchor {
  const pos = Math.min(1, Math.max(0, t)) * (anchors.length - 1)
  const i = Math.min(anchors.length - 2, Math.floor(pos))
  const f = pos - i
  const a = anchors[i], b = anchors[i + 1]
  // Every slider has at least two anchors, so both neighbours exist.
  if (!a || !b) throw new Error('lerpRanges needs two anchors')
  const out: Anchor = {}
  for (const key of anchorKeys(a)) {
    const ra = a[key], rb = b[key]
    // The anchors of one slider all name the same knobs, in the same form.
    if (!ra || !rb) throw new Error(`anchors disagree on ${key}`)
    if ('pick' in ra) {
      out[key] = f < 0.5 ? ra : rb
      continue
    }
    if ('pick' in rb) throw new Error(`anchors disagree on ${key}`)
    out[key] = {
      lo: ra.lo + (rb.lo - ra.lo) * f,
      hi: ra.hi + (rb.hi - ra.hi) * f,
      def: ra.def + (rb.def - ra.def) * f,
    }
  }
  return out
}

// Pulls an interpolated range onto the knob's step grid: lo up, hi down, the
// canonical value to the nearest step (a value off the step would look like a
// hand-typed oddity in the command).
function snapRange(key: ParamKey, range: Range): Range {
  if ('pick' in range) return range
  const spec = specOf(key)
  const steps = (v: number) => (v - spec.min) / spec.step
  const at = (n: number) => Number(Math.min(spec.max, Math.max(spec.min, spec.min + n * spec.step)).toFixed(6))
  const def = at(Math.round(steps(range.def)))
  const lo = at(Math.ceil(steps(range.lo) - 1e-9))
  const hi = at(Math.floor(steps(range.hi) + 1e-9))
  return lo > hi ? { lo: def, hi: def, def } : { lo: Math.min(lo, def), hi: Math.max(hi, def), def }
}

/** The knob ranges a choice controls at its slider positions, keyed by PARAM_SPEC key. */
export function simpleRanges(choice: SimpleChoice): Partial<Record<ParamKey, Range>> {
  const c = normalizeChoice(choice)
  const big = Math.max(c.W, c.H) > BIG_SIDE
  const merged: Anchor = {
    ...lerpRanges(LENGTH_ANCHORS, c.lengths),
    ...lerpRanges(SHAPE_ANCHORS, c.shape),
    ...(big ? bigShape(c.shape) : null),
    ...SKELETON[c.skeleton],
    ...DIFFICULTY,
    ...(big ? DIFFICULTY_BIG : null),
  }
  const out: Anchor = {}
  for (const key of anchorKeys(merged)) {
    const range = merged[key]
    // anchorKeys lists the keys merged actually has.
    if (!range) throw new Error(`no range for ${key}`)
    out[key] = snapRange(key, range)
  }
  return out
}

/** The straightness range of a shape anchor; the shape anchors all set pStraight as lo/hi/def. */
function straightOf(anchor: Anchor | null | undefined): { lo: number; hi: number; def: number } {
  const range = anchor?.pStraight
  if (!range || 'pick' in range) throw new Error('a shape anchor must set pStraight as a numeric range')
  return range
}

// The big-board straightness floor applies from the 0.5 anchor up, growing in
// with the slider so the small-board ranges are untouched below it.
function bigShape(t: number): Anchor | null {
  if (t <= 0.5) return null
  const base = straightOf(lerpRanges(SHAPE_ANCHORS, t))
  const raised = straightOf(lerpRanges(
    [SHAPE_ANCHORS[2], SHAPE_ANCHORS_BIG[3], SHAPE_ANCHORS_BIG[4]].map((a) => ({ pStraight: straightOf(a) })),
    (t - 0.5) * 2,
  ))
  return {
    pStraight: {
      lo: Math.max(base.lo, raised.lo),
      hi: Math.max(base.hi, raised.hi),
      def: Math.max(base.def, raised.def),
    },
  }
}

function draw(key: ParamKey, range: Range, rng: (() => number) | null): number {
  if (!rng) return range.def
  if ('pick' in range) {
    const v = range.pick[Math.min(range.pick.length - 1, Math.floor(rng() * range.pick.length))]
    if (v === undefined) throw new Error('empty pick list')
    return v
  }
  const spec = specOf(key)
  const raw = range.lo + rng() * (range.hi - range.lo)
  // Snap to the knob step, measured from the knob minimum like the lab slider.
  const snapped = spec.min + Math.round((raw - spec.min) / spec.step) * spec.step
  const v = Math.min(range.hi, Math.max(range.lo, snapped))
  return Number(v.toFixed(6))
}

/**
 * Full engine parameters for a choice. With `rng` (a function returning
 * [0, 1)) every ranged knob is drawn inside its range; without it the
 * canonical values are used. The bundle is drawn first and the knobs named in
 * `pins` are written over the result afterwards, so a pin changes only the
 * knob it names: every other knob keeps the value it would have had without
 * the pin, down to its place in the random stream.
 */
export function simpleParams(
  choice: SimpleChoice,
  rng: (() => number) | null = null,
  pins: Partial<Record<ParamKey, number>> = {},
): Params {
  const c = normalizeChoice(choice)
  const p: Params = { ...defaultParams(), W: c.W, H: c.H, seed: c.seed }
  const ranges = simpleRanges(c)
  for (const key of anchorKeys(ranges)) {
    const range = ranges[key]
    if (range) p[key] = draw(key, range, rng)
  }
  // The pins go on top of the finished draw, never into it: skipping a pinned
  // knob's draw would leave its value unspent in the stream and shift every
  // partner drawn after it. A pin on a knob no anchor controls (Lmax,
  // restarts, ...) is the only kind that adds a value here rather than
  // replacing one the draw just made.
  for (const [key, value] of Object.entries(pins)) {
    if (value !== undefined) p[key as ParamKey] = value
  }
  // The engine caps short + medium at 0.9. A pinned share is the caller's
  // word, so the clamp moves the other one; with both pinned it moves neither
  // and the envelope refuses the pair, identically on every seed.
  if (p.wShort + p.wMid > 0.9) {
    if (pins.wMid === undefined) p.wMid = Number((0.9 - p.wShort).toFixed(6))
    else if (pins.wShort === undefined) p.wShort = Number((0.9 - p.wMid).toFixed(6))
  }
  return p
}

/** The CLI's vocabulary for the simple choice: the recommended entry point for an application. */
export function presetParams(
  { W, H, seed, length, winding, skeleton, rng }: {
    W: number
    H: number
    seed?: number
    length?: number
    winding?: number
    skeleton?: boolean
    rng?: () => number
  },
): Params {
  const d = defaultChoice()
  return simpleParams({
    W,
    H,
    seed: seed ?? d.seed,
    lengths: length ?? d.lengths,
    // `winding` is the shape slider itself: 0 = straightest lines.
    shape: winding ?? d.shape,
    skeleton: skeleton ? 'on' : 'off',
  }, rng ?? null)
}
