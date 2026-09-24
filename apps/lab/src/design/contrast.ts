// WCAG 2.1 contrast over what the browser computed, for the browser tests that
// measure a colour pair. Test-only: the application never imports it.

export type RGB = [number, number, number]

/** WCAG 2.1 relative luminance. */
export function luminance([r, g, b]: RGB): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(front: RGB, back: RGB): number {
  const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a)
  if (light === undefined || dark === undefined) throw new Error('unreachable')
  return (light + 0.05) / (dark + 0.05)
}

/** `rgb(r, g, b)` or `rgba(r, g, b, a)`, as every engine serialises a colour. */
export function parse(value: string): { rgb: RGB; alpha: number } {
  const parts = /^rgba?\(([^)]+)\)$/
    .exec(value)?.[1]
    ?.split(/[,\s/]+/)
    .filter(Boolean)
  if (!parts || parts.length < 3) throw new Error(`cannot read the colour ${value}`)
  const [r, g, b, a] = parts.map(Number)
  if (r === undefined || g === undefined || b === undefined) throw new Error(`cannot read the colour ${value}`)
  return { rgb: [r, g, b], alpha: a ?? 1 }
}

/** `opacity` composites the element over what is behind it. */
export function over(front: RGB, back: RGB, alpha: number): RGB {
  const mix = (at: 0 | 1 | 2) => alpha * front[at] + (1 - alpha) * back[at]
  return [mix(0), mix(1), mix(2)]
}

/**
 * What a screen actually shows for one run of text: the element's own colour,
 * composited over the nearest painted background above it, at the product of
 * every `opacity` in between.
 *
 * Measured rather than read out of the stylesheet, so any rule that reaches
 * the same colours passes. The browser does the cascade; this file does only
 * the arithmetic.
 */
export function shown(node: Element): { front: RGB; back: RGB } {
  const own = parse(getComputedStyle(node).color)
  if (own.alpha !== 1) throw new Error('a translucent text colour needs a second compositing step')
  let alpha = 1
  let back: RGB | null = null
  for (let at: Element | null = node; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at)
    const paint = parse(style.backgroundColor)
    // The backdrop is the first painted background at or above the text: from
    // there down, every opacity between it and the text is a veil over it.
    if (back === null && paint.alpha > 0) {
      back = paint.rgb
      continue
    }
    if (back === null) alpha *= Number(style.opacity)
  }
  if (back === null) throw new Error('nothing above this text paints a background')
  return { front: over(own.rgb, back, alpha), back }
}
