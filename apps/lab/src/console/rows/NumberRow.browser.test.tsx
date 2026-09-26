import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { afterEach, expect, test } from 'vitest'
import { useStore } from '../../state/store'
import { ViewNumberRow } from './NumberRow'

// The view slice has no reset of its own; restore the module's starting view.
const initialView = useStore.getState().view
afterEach(() => useStore.setState({ view: initialView }))

test("the head width's auto chip releases to the width the row held before", async () => {
  useStore.getState().view.setNumber('headWidth', '0.5')
  const screen = await render(<ViewNumberRow field="headWidth" />)
  const chip = screen.getByRole('button', { name: /^auto \(/ })
  await userEvent.click(chip)
  expect(useStore.getState().view.headWidth).toBe(0)
  await userEvent.click(chip)
  expect(useStore.getState().view.headWidth).toBe(0.5)
})
