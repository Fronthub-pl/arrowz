// The simple view of the lab: a board size, three plain choices (lengths,
// shape, skeleton) and a seed, translated into a full engine parameter set.
//
// Every choice is a RANGE per knob with a canonical value. Without a random
// generator the canonical values are used, so the same choice always gives the
// same command; with one, each knob is drawn inside its range, so a second
// Generate with the same seed gives a different board. The ranges are
// narrower than the engine envelope (PARAM_SPEC / RULES): they follow the
// measurements in the analysis notes, and they narrow further with the board
// size. Knobs a choice does not name stay at their defaults — the closing
// knobs above all, because a random backtrack budget turns a jam into
// minutes of waiting instead of a quick restart.
//
// Labels come from the dictionaries (lab-i18n.mjs, `simple`); nothing here
// knows the DOM.
import { PARAM_SPEC, defaultParams } from './engine.mjs'
import { PRESETS } from './lab-presets.mjs'

const specByKey = new Map(PARAM_SPEC.map((s) => [s.key, s]))

/** Every distinct preset size, smallest first. */
export const SIMPLE_SIZES = (() => {
  const seen = new Map()
  for (const l of PRESETS) for (const o of l.options) {
    const id = `${o.params.W}x${o.params.H}`
    if (!seen.has(id)) seen.set(id, { id, W: o.params.W, H: o.params.H })
  }
  return [...seen.values()].sort((a, b) => a.W * a.H - b.W * b.H || a.W - b.W)
})()

export const SIMPLE_CHOICES = {
  lengths: ['long', 'medium', 'short'],
  shape: ['straight', 'wavy', 'winding'],
  skeleton: ['off', 'on'],
}

/** The choice that reproduces the engine defaults. */
export function defaultChoice() {
  const d = defaultParams()
  return { size: `${d.W}x${d.H}`, lengths: 'long', shape: 'wavy', skeleton: 'off', seed: d.seed }
}

// A range is { lo, hi, def } drawn uniformly and snapped to the knob step, or
// { pick: [...], def } drawn from a list.
const r = (lo, hi, def) => ({ lo, hi, def })

const LENGTHS = {
  // Defaults: 0.2 / 0.08 — most of the weight goes to the long bucket.
  long: { wShort: r(0.05, 0.25, 0.2), wMid: r(0, 0.15, 0.08) },
  medium: { wShort: r(0.15, 0.35, 0.25), wMid: r(0.35, 0.55, 0.45) },
  // Sum capped at 0.9 by the engine rule: 0.7 + 0.2 sits exactly on it.
  short: { wShort: r(0.5, 0.7, 0.6), wMid: r(0.1, 0.2, 0.2) },
}

// pStraight is the one knob that jams boards: 0.6 leaves 600×600 unclosed
// while 0.65 and 0.7 close; anticoil above 6 with pStraight below 0.7 jams
// too. Winding boards therefore stay at 0.65+ (0.7+ above 600 a side) with a
// low anticoil.
const SHAPE = {
  straight: { pStraight: r(0.92, 1, 0.95), wLateral: r(0, 3, 1), anticoil: r(1, 6, 6), warns: r(3, 5, 4) },
  wavy: { pStraight: r(0.8, 0.9, 0.85), wLateral: r(2, 5, 3), anticoil: r(4, 8, 6), warns: r(3, 6, 4) },
  winding: { pStraight: r(0.65, 0.78, 0.7), wLateral: r(4, 10, 6), anticoil: r(2, 6, 4), warns: r(4, 8, 5) },
}
const BIG_SIDE = 600
const SHAPE_BIG = { winding: { pStraight: r(0.7, 0.78, 0.72) } }

// Dense skeletons (wGiant ≥ 0.13 with step ≤ 7 and span ≥ 100) are the time
// tail of the measurements; these ranges stay below all three.
const SKELETON = {
  off: {},
  on: { giants: r(3, 6, 4), giantStep: r(6, 14, 14), giantJitter: r(0.3, 1, 0.6), giantSpan: r(10, 40, 30), wGiant: r(0, 0.1, 0) },
}

// Where pieces start and the probe share change the look without touching
// the closing; drawn in random mode, defaults otherwise. Layers mode (-1)
// starves at a million cells.
const DIFFICULTY = { headBias: { pick: [-1, 0, 1], def: 0 }, probe: r(0, 0.3, 0), probeLen: r(6, 40, 12) }
const DIFFICULTY_BIG = { headBias: { pick: [0, 1], def: 0 } }

export function sizeOf(id) {
  return SIMPLE_SIZES.find((s) => s.id === id) ?? SIMPLE_SIZES[0]
}

/** The knob ranges a choice controls, keyed by PARAM_SPEC key. */
export function simpleRanges(choice) {
  const size = sizeOf(choice.size)
  const big = Math.max(size.W, size.H) > BIG_SIDE
  return {
    ...LENGTHS[choice.lengths],
    ...SHAPE[choice.shape],
    ...(big ? SHAPE_BIG[choice.shape] : null),
    ...SKELETON[choice.skeleton],
    ...DIFFICULTY,
    ...(big ? DIFFICULTY_BIG : null),
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
  const size = sizeOf(choice.size)
  const p = { ...defaultParams(), W: size.W, H: size.H, seed: choice.seed }
  const ranges = simpleRanges(choice)
  for (const [key, range] of Object.entries(ranges)) p[key] = draw(key, range, rng)
  // The engine caps short + medium at 0.9; the ranges respect it, but a
  // rounding step could land a hair above.
  if (p.wShort + p.wMid > 0.9) p.wMid = Number((0.9 - p.wShort).toFixed(6))
  return p
}
