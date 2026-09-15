import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { Segmented } from './Segmented'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const
type Letter = (typeof OPTIONS)[number]['value']

/** The group is controlled; a host owns the value, as the store does on the page. */
function Host({ onChange }: { onChange?: ((next: Letter) => void) | undefined }) {
  const [value, setValue] = useState<Letter>('a')
  return (
    <Segmented
      label="Letters"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

test('is one named radio group with the chosen option checked', async () => {
  const screen = await render(<Host />)
  await expect.element(screen.getByRole('radiogroup', { name: 'Letters' })).toBeVisible()
  await expect.element(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'false')
})

test('a click chooses', async () => {
  const onChange = vi.fn()
  const screen = await render(<Host onChange={onChange} />)
  await screen.getByRole('radio', { name: 'Beta' }).click()
  expect(onChange).toHaveBeenCalledExactlyOnceWith('b')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
})

// The radio pattern: the arrows move the choice and the focus together and
// wrap at both ends; Home and End jump.
test('arrow keys move the choice and the focus together, wrapping', async () => {
  const screen = await render(<Host />)
  await screen.getByRole('radio', { name: 'Alpha' }).click()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus()
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
  await expect.element(screen.getByRole('radio', { name: 'Gamma' })).toHaveFocus()
  await userEvent.keyboard('{Home}')
  await expect.element(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'true')
})

test('only the chosen option is a tab stop', async () => {
  const screen = await render(<Host />)
  await expect.element(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('tabindex', '0')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('tabindex', '-1')
  await expect.element(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('tabindex', '-1')
})

test('takes its name from a visible label when it is given one', async () => {
  const screen = await render(
    <div>
      <span id="letters-label">Letters shown</span>
      <Segmented label="Letters" labelledBy="letters-label" options={OPTIONS} value="a" onChange={() => {}} />
    </div>,
  )
  const group = screen.getByRole('radiogroup', { name: 'Letters shown' })
  await expect.element(group).toBeVisible()
  // `aria-labelledby` wins name computation over `aria-label`, so the name
  // assertion above would pass even if `aria-label` stayed set. This is what
  // discriminates the branch: `labelledBy` given means no `aria-label`.
  await expect.element(group).not.toHaveAttribute('aria-label')
})
