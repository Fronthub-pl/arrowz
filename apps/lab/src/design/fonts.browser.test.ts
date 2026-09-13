import '@fontsource-variable/archivo'
import '@fontsource-variable/jetbrains-mono'
import './tokens.css'
import { expect, test } from 'vitest'

// The two design-system faces shipped for a while as declarations with nothing
// behind them: `--ui` and `--mono` named Archivo and JetBrains Mono, no
// `@font-face` rule existed anywhere, and every surface quietly rendered its
// fallback. Nothing caught it — a review reads the declared family, and a
// declared family is exactly what a missing font still reports.
//
// `document.fonts.check()` does not catch it either: it answers "could this be
// used", so it returns true for a family that will silently fall back. Width
// does not lie. A family the browser does not have renders identically to a
// name nobody ever defined, so that is the comparison.

function widthOf(family: string): number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) throw new Error('the browser gave no 2d context')
  ctx.font = `13px ${family}`
  // Mixed letters and digits: two faces can agree on one glyph's advance and
  // differ on the rest.
  return ctx.measureText('Generate 0123 — closed').width
}

const ABSENT = "'ZzNoSuchFamilyZz'"

test('the UI face is loaded, not merely named', async () => {
  // A face with `font-display: swap` loads on first use, so ask for it.
  await document.fonts.load("13px 'Archivo Variable'")
  expect(widthOf("'Archivo Variable'")).not.toBe(widthOf(ABSENT))
}, 20_000)

test('the mono face is loaded, not merely named', async () => {
  await document.fonts.load("13px 'JetBrains Mono Variable'")
  expect(widthOf("'JetBrains Mono Variable'")).not.toBe(widthOf(ABSENT))
}, 20_000)

// The tokens must resolve to the faces the packages declare. Both packages
// call themselves "<name> Variable", so a token naming only the plain name
// silently renders its next fallback instead.
//
// Comparing the stack against ABSENT is not enough, and the first draft of
// this test made exactly that mistake: `--ui: Archivo, Helvetica, …` on a Mac
// renders in Helvetica, which differs from an undefined family, so the check
// passed while the intended face was nowhere. The assertion has to be that the
// stack renders as the *intended* face, not merely as something.
const INTENDED: ReadonlyArray<readonly [string, string]> = [
  ['--ui', "'Archivo Variable'"],
  ['--mono', "'JetBrains Mono Variable'"],
]

test('each font token renders as the face it is meant to name', async () => {
  await Promise.all(INTENDED.map(([, family]) => document.fonts.load(`13px ${family}`)))
  const root = getComputedStyle(document.documentElement)
  for (const [token, family] of INTENDED) {
    const stack = root.getPropertyValue(token).trim()
    expect(stack, `${token} is empty`).not.toBe('')
    expect(widthOf(stack), `${token} does not render as ${family}`).toBe(widthOf(family))
  }
}, 20_000)
