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
// Labels come from the dictionaries (lab-i18n.mjs, `simple`); nothing here
// knows the DOM.
import { defaultParams, PARAM_SPEC } from './engine.mjs'
import { PRESETS } from './lab-presets.mjs'

const specByKey = new Map(PARAM_SPEC.map((s) => [s.key, s]))

/** Every distinct preset size, smallest first — the sizes the ranges are exercised at. */
export const SIMPLE_SIZES = (() => {
  const seen = new Map()
  for (const l of PRESETS) {
    for (const o of l.options) {
      const id = `${o.params.W}x${o.params.H}`
      if (!seen.has(id)) seen.set(id, { id, W: o.params.W, H: o.params.H })
    }
  }
  return [...seen.values()].sort((a, b) => a.W * a.H - b.W * b.H || a.W - b.W)
})()

/** Button choices. */
export const SIMPLE_CHOICES = {
  skeleton: ['off', 'on'],
}

// A range is { lo, hi, def } drawn uniformly and snapped to the knob step, or
// { pick: [...], def } drawn from a list.
const r = (lo, hi, def) => ({ lo, hi, def })

// Slider anchors, position 0 to 1 in steps of 0.25. The 0.75 anchor of the
// length slider and the 0.5 anchor of the shape slider are the engine
// defaults, so the default choice reproduces defaultParams() exactly.
const LENGTH_ANCHORS = [
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
const SHAPE_ANCHORS = [
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
const SHAPE_ANCHORS_BIG = [null, null, null, { pStraight: r(0.7, 0.78, 0.72) }, { pStraight: r(0.7, 0.72, 0.7) }]

export const SIMPLE_SLIDERS = {
  lengths: { anchors: LENGTH_ANCHORS },
  shape: { anchors: SHAPE_ANCHORS, big: SHAPE_ANCHORS_BIG },
}

// Dense skeletons (wGiant ≥ 0.13 with step ≤ 7 and span ≥ 100) are the time
// tail of the measurements; these ranges stay below all three.
const SKELETON = {
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
const DIFFICULTY = { headBias: { pick: [-1, 0, 1], def: 0 }, probe: r(0, 0.3, 0), probeLen: r(6, 40, 12) }
const DIFFICULTY_BIG = { headBias: { pick: [0, 1], def: 0 } }

/**
 * Cell size for the exported SVG: 1600 px on the longer side, between 1 and
 * 18 px. The lab and the CLI simple mode share it, so the same choice gives
 * the same file in both.
 */
export function exportCell(W, H) {
  return Math.max(1, Math.min(18, Math.round(1600 / Math.max(W, H))))
}

/** The choice that reproduces the engine defaults. */
export function defaultChoice() {
  const d = defaultParams()
  return { W: d.W, H: d.H, lengths: 0.75, shape: 0.5, skeleton: 'off', seed: d.seed }
}

// Recipes saved by the button version of the view carry category names.
const OLD_NAMES = {
  lengths: { short: 0.25, medium: 0.5, long: 0.75 },
  shape: { straight: 0.25, wavy: 0.5, winding: 0.75 },
}

/**
 * A choice with every field valid: old category names become slider
 * positions, numbers are clamped into 0..1, the size is clamped into the
 * engine range (an old `size` id such as "100x200" is read when W or H is
 * missing), anything else falls back to the default. Extra fields (the
 * randomise flag) ride along.
 */
export function normalizeChoice(raw) {
  const d = defaultChoice()
  const out = { ...raw }
  const old = typeof raw?.size === 'string' ? /^(\d+)x(\d+)$/.exec(raw.size) : null
  delete out.size
  for (const [key, i] of [['W', 1], ['H', 2]]) {
    const spec = specByKey.get(key)
    const v = typeof raw?.[key] === 'number' ? raw[key] : old ? Number(old[i]) : NaN
    out[key] = Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, Math.round(v))) : d[key]
  }
  for (const key of Object.keys(SIMPLE_SLIDERS)) {
    const v = raw?.[key]
    const named = typeof v === 'string' ? OLD_NAMES[key][v] : undefined
    const n = named ?? (typeof v === 'number' ? v : NaN)
    out[key] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d[key]
  }
  for (const [key, values] of Object.entries(SIMPLE_CHOICES)) if (!values.includes(raw?.[key])) out[key] = d[key]
  if (typeof raw?.seed !== 'number') out.seed = d.seed
  return out
}

// Interpolates the ranges of two neighbouring anchors, knob by knob.
function lerpRanges(anchors, t) {
  const pos = Math.min(1, Math.max(0, t)) * (anchors.length - 1)
  const i = Math.min(anchors.length - 2, Math.floor(pos))
  const f = pos - i
  const a = anchors[i], b = anchors[i + 1]
  const out = {}
  for (const key of Object.keys(a)) {
    if (a[key].pick) {
      out[key] = f < 0.5 ? a[key] : b[key]
      continue
    }
    out[key] = {
      lo: a[key].lo + (b[key].lo - a[key].lo) * f,
      hi: a[key].hi + (b[key].hi - a[key].hi) * f,
      def: a[key].def + (b[key].def - a[key].def) * f,
    }
  }
  return out
}

// Pulls an interpolated range onto the knob's step grid: lo up, hi down, the
// canonical value to the nearest step (a value off the step would look like a
// hand-typed oddity in the command).
function snapRange(key, range) {
  if (range.pick) return range
  const spec = specByKey.get(key)
  const steps = (v) => (v - spec.min) / spec.step
  const at = (n) => Number(Math.min(spec.max, Math.max(spec.min, spec.min + n * spec.step)).toFixed(6))
  const def = at(Math.round(steps(range.def)))
  const lo = at(Math.ceil(steps(range.lo) - 1e-9))
  const hi = at(Math.floor(steps(range.hi) + 1e-9))
  return lo > hi ? { lo: def, hi: def, def } : { lo: Math.min(lo, def), hi: Math.max(hi, def), def }
}

/** The knob ranges a choice controls at its slider positions, keyed by PARAM_SPEC key. */
export function simpleRanges(choice) {
  const c = normalizeChoice(choice)
  const big = Math.max(c.W, c.H) > BIG_SIDE
  const merged = {
    ...lerpRanges(LENGTH_ANCHORS, c.lengths),
    ...lerpRanges(SHAPE_ANCHORS, c.shape),
    ...(big ? bigShape(c.shape) : null),
    ...SKELETON[c.skeleton],
    ...DIFFICULTY,
    ...(big ? DIFFICULTY_BIG : null),
  }
  const out = {}
  for (const [key, range] of Object.entries(merged)) out[key] = snapRange(key, range)
  return out
}

// The big-board straightness floor applies from the 0.5 anchor up, growing in
// with the slider so the small-board ranges are untouched below it.
function bigShape(t) {
  if (t <= 0.5) return null
  const base = lerpRanges(SHAPE_ANCHORS, t).pStraight
  const raised = lerpRanges(
    [SHAPE_ANCHORS[2], SHAPE_ANCHORS_BIG[3], SHAPE_ANCHORS_BIG[4]].map((a) => ({ pStraight: a.pStraight })),
    (t - 0.5) * 2,
  ).pStraight
  return {
    pStraight: {
      lo: Math.max(base.lo, raised.lo),
      hi: Math.max(base.hi, raised.hi),
      def: Math.max(base.def, raised.def),
    },
  }
}

function draw(key, range, rng) {
  if (!rng) return range.def
  if (range.pick) return range.pick[Math.min(range.pick.length - 1, Math.floor(rng() * range.pick.length))]
  const spec = specByKey.get(key)
  const raw = range.lo + rng() * (range.hi - range.lo)
  // Snap to the knob step, measured from the knob minimum like the lab slider.
  const snapped = spec.min + Math.round((raw - spec.min) / spec.step) * spec.step
  const v = Math.min(range.hi, Math.max(range.lo, snapped))
  return Number(v.toFixed(6))
}

/**
 * Full engine parameters for a choice. With `rng` (a function returning
 * [0, 1)) every ranged knob is drawn inside its range; without it the
 * canonical values are used.
 */
export function simpleParams(choice, rng = null) {
  const c = normalizeChoice(choice)
  const p = { ...defaultParams(), W: c.W, H: c.H, seed: c.seed }
  const ranges = simpleRanges(c)
  for (const [key, range] of Object.entries(ranges)) p[key] = draw(key, range, rng)
  // The engine caps short + medium at 0.9; the ranges respect it at the
  // anchors, but a draw near the short end can land a hair above.
  if (p.wShort + p.wMid > 0.9) p.wMid = Number((0.9 - p.wShort).toFixed(6))
  return p
}
