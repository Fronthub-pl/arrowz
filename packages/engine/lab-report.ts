// The report of a run: metrics, carver statistics and timings as rows a
// surface can render without knowing what any of them mean. Pure: it takes
// the run, the knobs and a dictionary, and returns strings.
import type { BoardMeta } from './types.ts'

/**
 * How long a stored board took to generate, or the dash the surface uses when
 * it was saved before the timing existed. Two decimals under ten seconds, one
 * above: on a fast board the second decimal is the difference between runs.
 */
export function genSeconds(meta: BoardMeta, dash: string): string {
  return meta.genMs === null ? dash : (meta.genMs / 1000).toFixed(meta.genMs < 10000 ? 2 : 1)
}
