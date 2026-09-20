import { expect, test } from 'vitest'
import { themeOf, THEMES } from './themes.ts'

const srgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
function luminance(hex: string): number {
  const [r, g, b] = srgb(hex).map(lin)
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

test('twelve themes, six of them light', () => {
  expect(Object.keys(THEMES)).toHaveLength(12)
  const light = Object.values(THEMES).filter((t) => luminance(t.paper) > 0.5)
  expect(light).toHaveLength(6)
})

test('every colour is a six-digit hex, so nothing needs parsing to compare', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of [t.paper, t.ink, t.highlight, ...t.palette]) {
      expect(c, `${name}: ${c}`).toMatch(/^#[0-9a-f]{6}$/)
    }
  }
})

test('every arrow colour clears 3:1 against its own paper', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of t.palette) expect(contrast(c, t.paper), `${name} ${c}`).toBeGreaterThanOrEqual(3)
  }
})

test('every ink clears 4.5:1, because a monochrome board is all ink', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(contrast(t.ink, t.paper), name).toBeGreaterThanOrEqual(4.5)
  }
})

test('the highlight is readable and is never one of the arrow colours', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(contrast(t.highlight, t.paper), name).toBeGreaterThanOrEqual(3)
    expect(t.palette, name).not.toContain(t.highlight)
  }
})

test('every theme names where it came from and under what licence', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(t.source, name).not.toBe('')
    expect(t.licence, name).toMatch(/^(MIT|ISC|Apache-2\.0)$/)
    expect(t.url, name).toMatch(/^https:\/\//)
  }
})

test('themeOf takes a name and refuses anything else', () => {
  expect(themeOf('gruvbox-dark')?.paper).toBe('#282828')
  expect(themeOf('no-such-theme')).toBeNull()
  expect(themeOf('')).toBeNull()
})

// The `Object.hasOwn` guard is load-bearing. Without it, a prototype
// property name reads through and returns `Object.prototype.toString`, whose
// `.paper`/`.ink`/`.highlight` are `undefined` — `drawView()` would then
// spread those over `DEFAULT_VIEW`, silently defaulting the colours instead
// of ignoring the unknown name.
test('themeOf refuses a name that only Object.prototype owns', () => {
  expect(themeOf('toString')).toBeNull()
  expect(themeOf('constructor')).toBeNull()
  expect(themeOf('hasOwnProperty')).toBeNull()
})
