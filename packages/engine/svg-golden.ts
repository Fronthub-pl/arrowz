// The boards and options whose toSvg output is pinned by svg-golden.json.
// The recorder and the test share this list so they can never disagree.
import { defaultParams } from './engine.ts'
import type { Params, SvgOptions } from './types.ts'

export interface SvgGoldenCase {
  name: string
  params: Params
  unchecked: boolean
  opts: SvgOptions
}

export const SVG_GOLDEN_CASES: readonly SvgGoldenCase[] = [
  { name: 'defaults', params: defaultParams(), unchecked: false, opts: {} },
  {
    name: 'skeleton-top',
    params: { ...defaultParams(), W: 100, H: 200, giants: 4 },
    unchecked: false,
    opts: { cell: 12, top: 5 },
  },
  {
    name: 'colored-stick',
    params: defaultParams(),
    unchecked: false,
    opts: { colored: true, strokeRatio: 0.7, headWidth: 0.9, headHeight: 1.1 },
  },
  {
    name: 'thin-narrow-head',
    params: defaultParams(),
    unchecked: false,
    opts: { strokeRatio: 0.3, headWidth: 0.2 },
  },
  {
    name: 'voids',
    params: { ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 },
    unchecked: true,
    opts: { voids: true, cell: 8 },
  },
]
