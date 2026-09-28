import { assert, assertEquals, assertGreaterOrEqual, assertMatch } from '@std/assert'
import { DEFAULT_COLOURS, isHexColour, PAD_RANGE, POINT_RADIUS_RANGE, resolveColours, themeOf, THEMES } from './look.ts'

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

Deno.test('twelve themes, six of them light', () => {
  assertEquals(Object.keys(THEMES).length, 12)
  assertEquals(Object.values(THEMES).filter((t) => luminance(t.paper) > 0.5).length, 6)
})

Deno.test('every colour is a six-digit hex, so nothing needs parsing to compare', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of [t.paper, t.ink, t.highlight, ...t.palette]) assertMatch(c, /^#[0-9a-f]{6}$/, `${name}: ${c}`)
  }
})

Deno.test('every arrow colour clears 3:1 against its own paper', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of t.palette) assertGreaterOrEqual(contrast(c, t.paper), 3, `${name} ${c}`)
  }
})

Deno.test('every ink clears 4.5:1, because a monochrome board is all ink', () => {
  for (const [name, t] of Object.entries(THEMES)) assertGreaterOrEqual(contrast(t.ink, t.paper), 4.5, name)
})

Deno.test('the highlight is readable and is never one of the arrow colours', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assertGreaterOrEqual(contrast(t.highlight, t.paper), 3, name)
    assert(!t.palette.includes(t.highlight), name)
  }
})

Deno.test('every theme names where it came from and under what licence', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert(t.source !== '', name)
    assertMatch(t.licence, /^(MIT|ISC|Apache-2\.0)$/, name)
    assertMatch(t.url, /^https:\/\//, name)
  }
})

Deno.test('themeOf takes a name and refuses anything else', () => {
  assertEquals(themeOf('gruvbox-dark')?.paper, '#282828')
  assertEquals(themeOf('no-such-theme'), null)
  assertEquals(themeOf(''), null)
})

// Without `Object.hasOwn` a prototype name reads through, and resolveColours
// would spread its undefined colours over the defaults.
Deno.test('themeOf refuses a name that only Object.prototype owns', () => {
  for (const name of ['toString', 'constructor', 'hasOwnProperty']) assertEquals(themeOf(name), null, name)
})

Deno.test('resolveColours: no theme and nothing stated is the default', () => {
  assertEquals(resolveColours('', {}), { ...DEFAULT_COLOURS })
})

Deno.test('resolveColours: a theme supplies all four', () => {
  const t = THEMES['gruvbox-dark']
  assertEquals(resolveColours('gruvbox-dark', {}), {
    paper: t?.paper,
    ink: t?.ink,
    highlight: t?.highlight,
    palette: t?.palette,
  })
})

Deno.test('resolveColours: a stated colour beats the theme, field by field', () => {
  const got = resolveColours('gruvbox-dark', { ink: '#abcdef', palette: ['#112233'] })
  assertEquals(got.ink, '#abcdef')
  assertEquals(got.palette, ['#112233'])
  assertEquals(got.paper, THEMES['gruvbox-dark']?.paper)
})

Deno.test('resolveColours: an unknown theme name is the default, as themeOf', () => {
  assertEquals(resolveColours('no-such-theme', {}), resolveColours('', {}))
})

Deno.test('the defaults are the colours toSvg draws without options', () => {
  assertEquals(DEFAULT_COLOURS, { paper: '#f6f6fa', ink: '#232447', highlight: '#e8467c', palette: [] })
})

Deno.test('isHexColour takes #rrggbb in either case and nothing else', () => {
  for (const c of ['#abcdef', '#ABCDEF', '#012345']) assert(isHexColour(c), c)
  for (const c of ['', '#abc', 'abcdef', '#abcdefa', 'red', '#ghijkl', 12, null, undefined]) {
    assert(!isHexColour(c), String(c))
  }
})

Deno.test('the pad and point bounds are the element’s', () => {
  assertEquals(PAD_RANGE, { min: 0, max: 16 })
  assertEquals(POINT_RADIUS_RANGE, { min: 0, max: 0.5 })
})
