import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { Violations } from './Violations'

const params = () => useStore.getState().params

test('nothing is shown while the settings are valid', async () => {
  params().reset()
  const screen = await render(<Violations />)
  expect(screen.container.querySelectorAll('#violations')).toHaveLength(0)
})

test('a violation is listed with its own text', async () => {
  params().reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  const screen = await render(<Violations />)
  await expect.element(screen.getByRole('region', { name: 'Settings outside the safe range' })).toBeVisible()
  expect(screen.container.querySelectorAll('#violations li').length).toBeGreaterThan(0)
})

test('a computed bound is named in the text, not left to the marker', async () => {
  params().reset()
  params().setMany({ W: 900, H: 900, pStraight: 0.6 })
  const screen = await render(<Violations />)
  // needViolation prints the number the board asks for.
  await expect.element(screen.getByText(/needs at least/)).toBeVisible()
})
