import { PARAM_SPEC } from '@arrowz/engine'
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

test('the knob shows its label, its value and what it does', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await expect.element(screen.getByText('closing off nooks')).toBeVisible()
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toMatchTextContent(/4/)
  // The description is not decoration: it is the only thing that says what a
  // knob called "closing off nooks" does, and the old lab prints it (lab-page.ts:165-173).
  await expect.element(screen.getByText(/fills nooks with few exits first/)).toBeVisible()
})

test('a value with a word shows the word beside the number', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('Lmax')} />)
  // toMatchTextContent, not toHaveTextContent: the button reads "auto0".
  await expect.element(screen.getByRole('button', { name: /maximum length/ })).toMatchTextContent(/auto/)
})

test('typing a fraction does not collapse while it is being typed', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  await screen.getByRole('button', { name: /straightness/ }).click()
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
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.keyboard('12{Enter}')
  // Without this, editing twenty-eight knobs means Tabbing from the top of the
  // document after every commit (Ruling 4).
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toHaveFocus()
})

test('Escape abandons the draft', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '12')
  await userEvent.keyboard('{Escape}')
  expect(params().values.warns).toBe(4)
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toBeVisible()
})

test('an Escape does not eat the edit that comes after it', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.keyboard('{Escape}')
  // The regression this guards is a flag armed for a blur React never sends:
  // it survives the cancel and swallows the next commit instead.
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '9')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(9)
})

test('Enter closes the entry instead of reopening it', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
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
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '99')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(16)
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toMatchTextContent(/16/)
})

test('a value outside the passed bounds is held inside them', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('mix')} bounds={{ min: 0.3, max: 0.7 }} />)
  await screen.getByRole('button', { name: /mixing/i }).click()
  await userEvent.fill(screen.getByRole('textbox'), '0.1')
  await userEvent.keyboard('{Enter}')
  // The knob's own range starts at -1, so `clampParam` alone would store 0.1 —
  // a share `--start` cannot spell (lab-page.ts:280-284).
  expect(params().values.mix).toBe(0.3)
})

test('a typo is refused rather than snapping the knob to its default', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
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
  const why = screen.container.querySelector('.why')
  expect(why?.textContent ?? '').toContain('0.9')
  expect(screen.container.querySelector('.fw-k')?.className).toContain('bad')
  await expect.element(screen.getByRole('slider')).toHaveAttribute('aria-describedby', 'knob-wShort-why')
})

test('an inactive knob says what would make it do something', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('giantSpan')} />)
  // giants is 0, so the serpentine knobs do nothing.
  expect(screen.container.querySelector('.why')?.textContent).toContain('No effect:')
})

test('a knob under a rule floor states the bound in words, not only as a mark', async () => {
  params().reset()
  params().setMany({ W: 900, H: 900 })
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  // 0.85 is above the floor here, so there is no violation — and the marker on
  // the track is the only other place this number appears.
  expect(screen.container.querySelector('.why')?.textContent).toContain('Rule bound')
})
