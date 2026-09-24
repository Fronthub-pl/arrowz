import '@fontsource-variable/archivo'
import '@fontsource-variable/jetbrains-mono'
import './tokens.css'
import { expect, test } from 'vitest'

// A missing font still reports its declared family, and `document.fonts.check()`
// answers "could this be used", true even for a family that silently falls
// back. Width does not lie: a family the browser lacks renders identically to
// a name nobody defined, so that is the comparison.

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

// Both packages call themselves "<name> Variable", so a token naming only the
// plain name renders its next fallback. Differing from ABSENT is not enough:
// on a Mac the Helvetica fallback differs too, so the stack must render as
// the intended face.
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
