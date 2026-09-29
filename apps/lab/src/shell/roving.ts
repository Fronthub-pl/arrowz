/** Which arrows move along a strip: ← → for a row, ↑ ↓ for a rail, all four for a radio group. */
export type RovingAxis = 'horizontal' | 'vertical' | 'both'

const FORWARD: Record<RovingAxis, readonly string[]> = {
  horizontal: ['ArrowRight'],
  vertical: ['ArrowDown'],
  both: ['ArrowRight', 'ArrowDown'],
}
const BACK: Record<RovingAxis, readonly string[]> = {
  horizontal: ['ArrowLeft'],
  vertical: ['ArrowUp'],
  both: ['ArrowLeft', 'ArrowUp'],
}

/**
 * The index a key moves to in a strip of `count` items, or `null` when the key
 * does not move it (another key, or an empty strip). Home and End jump; the
 * arrows step and, at the ends, wrap or stop. With nothing selected
 * (`current` -1) forward lands on the first item and back on the last; a
 * `current` past the end counts from the last item.
 */
export function nextIndex(
  key: string,
  current: number,
  count: number,
  { axis, wrap }: { axis: RovingAxis; wrap: boolean },
): number | null {
  if (count <= 0) return null
  const last = count - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  const step = FORWARD[axis].includes(key) ? 1 : BACK[axis].includes(key) ? -1 : 0
  if (step === 0) return null
  if (current < 0) return step === 1 ? 0 : last
  const at = Math.min(current, last) + step
  if (at > last) return wrap ? 0 : last
  if (at < 0) return wrap ? last : 0
  return at
}
