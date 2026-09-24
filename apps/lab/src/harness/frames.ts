/**
 * Two frames, because HTML's focus fixup is the "update the rendering" step,
 * which runs after the animation-frame callbacks of the same frame. Measured in
 * Chrome: short of two frames the fixup had nearly always not run yet, after
 * two it always had. Two is the floor, not a margin; do not shorten it.
 */
export function twoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}
