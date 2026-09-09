// Presets for the lab: a tree of difficulty levels, each with a few options.
// An option is a full configuration = engine defaults + these overrides, so
// choosing one never inherits knobs left over from the previous experiment.
// Labels come from the dictionaries (lab-i18n.ts) by level id and mode.
import type { Params, Preset, PresetLevel } from './types.ts'

function level(id: string, side: number, tall: number): PresetLevel {
  return {
    id,
    options: [
      { id: `${id}-square`, mode: 'square', params: { W: side, H: side } },
      { id: `${id}-portrait`, mode: 'portrait', params: { W: side, H: tall } },
      { id: `${id}-tunnels`, mode: 'tunnels', params: { W: side, H: tall, headBias: 1 } },
      { id: `${id}-skeleton`, mode: 'skeleton', params: { W: side, H: tall, giants: 4 } },
    ],
  }
}

export const PRESETS: readonly PresetLevel[] = [
  level('easy', 25, 50),
  level('medium', 50, 100),
  level('hard', 75, 150),
  level('nightmare', 100, 200),
  level('extreme', 200, 400),
  {
    id: 'huge',
    options: [
      { id: 'huge-400', mode: 'square', params: { W: 400, H: 400 } },
      { id: 'huge-400-skeleton', mode: 'skeleton', params: { W: 400, H: 400, giants: 4 } },
      // Winding skeletons: every run is cut short (jitter 1), so no line goes
      // wall to wall, and a step of 3 keeps the snake long. Measured at 400×400,
      // seed 7: longest skeleton 2481 cells with 365 bends and a longest straight
      // run of 42 (defaults: 4065 cells, 72 bends, a run of 399).
      {
        id: 'huge-400-serpentine',
        mode: 'serpentine',
        params: { W: 400, H: 400, giants: 4, giantStep: 3, giantJitter: 1 },
      },
    ],
  },
  // The project ceiling: a million cells, ~90 000 pieces. Square only, like
  // Extreme in the game — a 1000×2000 portrait would double a generation that
  // already takes ~10 s in Node and ~27 s in a Chrome worker.
  {
    id: 'insane',
    options: [
      { id: 'insane-square', mode: 'square', params: { W: 1000, H: 1000 } },
      { id: 'insane-tunnels', mode: 'tunnels', params: { W: 1000, H: 1000, headBias: 1 } },
      { id: 'insane-skeleton', mode: 'skeleton', params: { W: 1000, H: 1000, giants: 4 } },
    ],
  },
]

/** Typed Object.keys for a preset's overrides. */
function overrideKeys(p: Preset): (keyof Preset['params'])[] {
  return Object.keys(p.params) as (keyof Preset['params'])[]
}

/**
 * The option matching the current parameters, or null. The most specific
 * match wins: "portrait" is a subset of "tunnels", so with tunnels on the
 * tunnels option is the answer. Knobs outside the preset are ignored.
 */
export function findPreset(params: Params): Preset | null {
  let best: Preset | null = null
  for (const l of PRESETS) {
    for (const o of l.options) {
      const keys = overrideKeys(o)
      const matches = keys.every((k) => params[k] === o.params[k])
      if (matches && keys.length > (best ? overrideKeys(best).length : 0)) best = o
    }
  }
  return best
}
