import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { ValueKnob } from '../console/ValueKnob'
import { useStore } from '../state/store'
import './tokens.css'
import './shell.css'
import './console.css'

type RGB = [number, number, number]

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: RGB): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(front: RGB, back: RGB): number {
  const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a)
  if (light === undefined || dark === undefined) throw new Error('unreachable')
  return (light + 0.05) / (dark + 0.05)
}

/** `rgb(r, g, b)` or `rgba(r, g, b, a)`, as every engine serialises a colour. */
function parse(value: string): { rgb: RGB; alpha: number } {
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
function over(front: RGB, back: RGB, alpha: number): RGB {
  const mix = (at: 0 | 1 | 2) => alpha * front[at] + (1 - alpha) * back[at]
  return [mix(0), mix(1), mix(2)]
}

/**
 * What a screen actually shows for one run of text: the element's own colour,
 * composited over the nearest painted background above it, at the product of
 * every `opacity` in between.
 *
 * Measured rather than read out of the stylesheet. The rule that dims a knob is
 * not the only rule allowed to exist — dimming the slider alone and leaving the
 * text at full strength is an equally good answer to the same finding — and a
 * test that greps for one of them fails the other for no reason. The browser
 * does the cascade here; this file does only the arithmetic.
 */
function shown(node: Element): { front: RGB; back: RGB } {
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

/**
 * This console argues, on purpose, that a knob which does nothing is *not*
 * disabled — it is focusable, operable and it keeps its value — so it cannot
 * claim the exemption WCAG grants disabled controls, and every run of text in
 * it has to clear AA like any other text (spec §7.1, Finding D).
 */
test('no text in an inactive knob is dimmed further than AA allows', async () => {
  useStore.getState().params.reset()
  // giants is 0, so the serpentine knobs do nothing: the same knob
  // ValueKnob.browser.test.tsx uses to assert the `off` class is applied.
  const spec = PARAM_SPEC.find((s) => s.key === 'giantSpan')
  if (!spec) throw new Error('no spec for giantSpan')
  const screen = await render(<ValueKnob spec={spec} />)
  const knob = screen.container.querySelector('.fw-k.off')
  if (!knob) throw new Error('the knob under test is not in the inactive state')

  // Every element holding text of its own, not a hand-written list of class
  // names: a run this console adds later is measured the day it is added.
  const runs = [...knob.querySelectorAll('*')].filter((node) =>
    [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()),
  )
  expect(runs.length).toBeGreaterThan(2)
  for (const run of runs) {
    const { front, back } = shown(run)
    expect(
      contrast(front, back),
      `${run.className || run.nodeName} reads ${run.textContent?.slice(0, 24)}`,
    ).toBeGreaterThanOrEqual(4.5)
  }
})
