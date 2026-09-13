import { expect, test } from 'vitest'
import console_ from './console.css?raw'
import tokens from './tokens.css?raw'

/** A hex token's three channels, from the declaration in tokens.css. */
function token(name: string): [number, number, number] {
  const match = new RegExp(`${name}:\\s*#([0-9a-f]{6})`).exec(tokens)
  if (!match?.[1]) throw new Error(`tokens.css declares no ${name}`)
  const hex = match[1]
  return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(front: [number, number, number], back: [number, number, number]): number {
  const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a)
  if (light === undefined || dark === undefined) throw new Error('unreachable')
  return (light + 0.05) / (dark + 0.05)
}

/** `opacity` composites the element over what is behind it. */
function over(
  front: [number, number, number],
  back: [number, number, number],
  alpha: number,
): [number, number, number] {
  const mix = (at: 0 | 1 | 2) => alpha * front[at] + (1 - alpha) * back[at]
  return [mix(0), mix(1), mix(2)]
}

/**
 * The dim an inactive knob wears. This console argues, on purpose, that such a
 * knob is *not* disabled — it is focusable, operable and it keeps its value —
 * so it cannot claim the exemption WCAG grants disabled controls, and its text
 * has to clear AA like any other text (spec §7.1, Finding D).
 */
test('an inactive knob dims its text no further than AA allows', () => {
  const rule = /\.fw-k\.off[^{]*\{[^}]*opacity:\s*([\d.]+)/.exec(console_)
  if (!rule?.[1]) throw new Error('console.css no longer dims an inactive knob with opacity')
  const dimmed = over(token('--mist'), token('--void'), Number(rule[1]))
  expect(contrast(dimmed, token('--void'))).toBeGreaterThanOrEqual(4.5)
})
