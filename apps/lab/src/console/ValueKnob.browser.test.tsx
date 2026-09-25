import { PARAM_SPEC } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { act } from 'react'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ValueKnob } from './ValueKnob'

const specOf = (key: string) => {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`no spec for ${key}`)
  return spec
}
const params = () => useStore.getState().params
const EN = dictionary('en')

test('the knob shows its short label, its value and its bounds', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await expect.element(screen.getByText('nooks first', { exact: true })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: /^nooks first:/ })).toHaveTextContent('4')
  const ends = [...screen.container.querySelectorAll('.kv-end')].map((el) => el.textContent)
  expect(ends).toEqual(['2', '16'])
  // The description is in the tree, closed until its `?` opens it.
  const help = screen.container.querySelector('#knob-warns-desc')
  expect(help?.textContent).toBe(EN.paramText(specOf('warns')).help)
  expect(help?.classList.contains('fw-vh')).toBe(true)
})

test('a large bound is shortened, and the exact range stays in the title', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('seed')} />)
  const ends = [...screen.container.querySelectorAll('.kv-end')].map((el) => el.textContent)
  expect(ends).toEqual(['0', '4.3G'])
  expect(screen.container.querySelector('.kv-row')?.getAttribute('title')).toContain('4,294,967,295')
})

test('a special value shows its word alone, and its chip is pressed', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('Lmax')} />)
  await expect.element(screen.getByRole('button', { name: /^max length:/ })).toHaveTextContent('auto')
  await expect
    .element(screen.getByRole('button', { name: 'auto (max length)' }))
    .toHaveAttribute('aria-pressed', 'true')
  expect(screen.container.querySelector('.kv-unit')?.textContent).toBe('')
})

// `Lmax` defaults to `auto` itself, so a first release goes to `RELEASE_TO`.
test('the chip toggles the special value, and a first release lands on a legal value', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('Lmax')} />)
  const chip = screen.getByRole('button', { name: 'auto (max length)' })
  await chip.click()
  expect(params().values.Lmax).toBe(17)
  expect(params().violations).toEqual([])
  await expect.element(chip).toHaveAttribute('aria-pressed', 'false')
  await chip.click()
  expect(params().values.Lmax).toBe(0)
})

test('a released chip goes back to the value the knob held before', async () => {
  params().reset()
  params().setMany({ giantStep: 5 })
  const screen = await render(<ValueKnob spec={specOf('giantStep')} />)
  const chip = screen.getByRole('button', { name: 'random (run gap)' })
  await expect.element(chip).toHaveAttribute('aria-pressed', 'false')
  await chip.click()
  expect(params().values.giantStep).toBe(0)
  await chip.click()
  expect(params().values.giantStep).toBe(5)
})

test('the special chip speaks the page language, and choosing it still writes the minimum', async () => {
  params().reset()
  await act(async () => useStore.getState().lang.setLang('pl'))
  try {
    const screen = await render(<ValueKnob spec={specOf('giantStep')} />)
    const chip = screen.getByRole('button', { name: /^losowo \(/ })
    await expect.element(chip).toHaveTextContent('losowo')
    await chip.click()
    expect(params().values.giantStep).toBe(0)
    expect(screen.container.querySelector('.kv-val')?.textContent).toContain('losowo')
  } finally {
    await act(async () => useStore.getState().lang.setLang('en'))
  }
})

test('typing a fraction does not collapse while it is being typed', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  await screen.getByRole('button', { name: /^straightness:/ }).click()
  const entry = screen.getByRole('textbox')
  await userEvent.fill(entry, '0.')
  // The store is untouched: a clamp per keystroke would make this 0.6 and the
  // next two characters would be typed into a value that moved.
  expect(params().values.pStraight).toBe(0.85)
  await userEvent.fill(entry, '0.92')
  await userEvent.keyboard('{Enter}')
  expect(params().values.pStraight).toBe(0.92)
})

test('committing returns focus to the number, not to the document', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /^nooks first:/ }).click()
  await userEvent.keyboard('12{Enter}')
  // Otherwise editing many knobs means Tabbing from the top of the document
  // after every commit.
  await expect.element(screen.getByRole('button', { name: /^nooks first:/ })).toHaveFocus()
})

test('Escape abandons the draft', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /^nooks first:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '12')
  await userEvent.keyboard('{Escape}')
  expect(params().values.warns).toBe(4)
  await expect.element(screen.getByRole('button', { name: /^nooks first:/ })).toBeVisible()
})

test('an Escape does not eat the edit that comes after it', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /^nooks first:/ }).click()
  await userEvent.keyboard('{Escape}')
  // The regression this guards is a flag armed for a blur React never sends:
  // it survives the cancel and swallows the next commit instead.
  await screen.getByRole('button', { name: /^nooks first:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '9')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(9)
})

test('Enter closes the entry instead of reopening it', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /^nooks first:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '7')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(7)
  // Commit focuses the number button; without preventDefault the same key's
  // keypress activates it and the entry is back on screen.
  expect(screen.container.querySelectorAll('input[type="text"]')).toHaveLength(0)
})

test('a committed value out of range is clamped, and the field shows the clamped value', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /^nooks first:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '99')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(16)
  await expect.element(screen.getByRole('button', { name: /^nooks first:/ })).toMatchTextContent(/16/)
})

test('a value outside the passed bounds is held inside them', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('mix')} bounds={{ min: 0.3, max: 0.7 }} />)
  await screen.getByRole('button', { name: /^tunnel share:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '0.1')
  await userEvent.keyboard('{Enter}')
  // The knob's own range starts at -1, so `clampParam` alone would store 0.1 —
  // a share `--start` cannot spell.
  expect(params().values.mix).toBe(0.3)
})

test('a typo is refused rather than snapping the knob to its default', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /^nooks first:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), 'abc')
  await userEvent.keyboard('{Enter}')
  // `clampParam` maps NaN to the default with `clamped: true`, which would be
  // an invisible jump nobody asked for.
  expect(params().values.warns).toBe(4)
})

test('an external change wins over a knob nobody is typing into', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  params().set('warns', 9)
  await expect.element(screen.getByRole('slider')).toHaveValue('9')
})

test('a violated knob says why, in error colour, and the slider points at the reason', async () => {
  params().reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  const screen = await render(<ValueKnob spec={specOf('wShort')} />)
  // The state line holds only the reason; the description is the row's own
  // paragraph, closed.
  const reason = screen.container.querySelector('.kv-why')
  expect(reason?.textContent ?? '').toContain('0.9')
  expect(screen.container.querySelector('.kv-row')?.className).toContain('bad')
  await expect
    .element(screen.getByRole('slider'))
    .toHaveAttribute('aria-describedby', 'knob-wShort-why knob-wShort-desc')
})

test('an inactive knob says what would make it do something', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('giantSpan')} />)
  // giants is 0, so the serpentine knobs do nothing. Standing alone — no
  // dependency block saying it for the row — the knob says so itself.
  expect(screen.container.querySelector('.kv-why')?.textContent).toContain('No effect:')
  // Deliberately dimmed, not disabled: the knob stays focusable and keeps what
  // is typed into it. A "correction" to `aria-disabled` would be silent, so
  // both halves are asserted.
  expect(screen.container.querySelector('.kv-row')?.className).toContain('off')
  expect(screen.container.querySelector('[aria-disabled]')).toBeNull()
})

test('the reason reaches the number and the inline entry, not only the slider', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('giantSpan')} />)
  const number = screen.getByRole('button', { name: /^length:/ })
  await expect.element(number).toHaveAttribute('aria-describedby', 'knob-giantSpan-why knob-giantSpan-desc')
  await number.click()
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveAttribute('aria-describedby', 'knob-giantSpan-why knob-giantSpan-desc')
})

test('a knob under a rule floor states the bound in words, not only as a mark', async () => {
  params().reset()
  params().setMany({ W: 900, H: 900 })
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  // 0.85 is above the floor here, so there is no violation, and the marker
  // would be the only other place this number appears.
  expect(screen.container.querySelector('.kv-why')?.textContent).toContain('Minimum for this board')
})

test('a floor sitting on the knob maximum is stated too, not left to the marker alone', async () => {
  params().reset()
  // A side of 1800 buys nine steps, so `straightFloor` returns exactly 1 — the
  // knob's own maximum. `pStraight` goes there too: a broken knob shows its
  // violation instead of its bound, and the bound is what this test is about.
  params().setMany({ W: 1000, H: 1000, warns: 2, anticoil: 7, pStraight: 1 })
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  expect(screen.container.querySelector('.kv-why')?.textContent).toContain('Minimum for this board: 1')
})

test('a fractional knob takes a decimal comma', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  await screen.getByRole('button', { name: /^straightness:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '0,7')
  await userEvent.keyboard('{Enter}')
  expect(params().values.pStraight).toBe(0.7)
})
