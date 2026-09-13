import { beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ViewPanel } from './ViewPanel'

const view = () => useStore.getState().view

// The store outlives a test; every file that writes it puts it back.
beforeEach(() => {
  view().setNumber('cell', '12')
  view().setNumber('stroke', '0.5')
  view().setNumber('top', '5')
  if (!view().rounded) view().toggle('rounded')
  if (view().colored) view().toggle('colored')
})

test('the panel draws all nine preview controls', async () => {
  const screen = await render(<ViewPanel />)
  expect(screen.container.querySelectorAll('input[type="number"]')).toHaveLength(5)
  expect(screen.container.querySelectorAll('[role="switch"]')).toHaveLength(4)
})

test('a switch is a switch, not a checkbox pretending to be one', async () => {
  const screen = await render(<ViewPanel />)
  const rounded = screen.getByRole('switch', { name: /round the corners/i })
  await expect.element(rounded).toHaveAttribute('aria-checked', 'true')
  await rounded.click()
  expect(view().rounded).toBe(false)
})

test('a number field commits on blur, clamped to what the CLI takes', async () => {
  const screen = await render(<ViewPanel />)
  const cell = screen.getByRole('spinbutton', { name: /cell size/i })
  await userEvent.fill(cell, '300')
  await userEvent.tab()
  // 200 is the CLI's ceiling; the field's own max of 40 only stops the arrows.
  expect(view().cell).toBe(200)
  await expect.element(cell).toHaveValue(200)
})

test('a field being typed into is not rewritten under the cursor', async () => {
  const screen = await render(<ViewPanel />)
  const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
  await stroke.click()
  // Digit by digit, the way a person types: after `0.` a controlled number
  // input reads back the empty string, and React would put the default in the
  // box mid-word. The store must not have moved yet either.
  // ControlOrMeta, not Control: on macOS Ctrl+A moves the caret to the line
  // start, so the field would read `080.5` and this test would pass on CI and
  // fail on the machine it was written on.
  await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}0.')
  expect(view().stroke).toBe(0.5)
  await userEvent.keyboard('8{Enter}')
  expect(view().stroke).toBe(0.8)
})

test('the panel is the tabpanel the rail points at', async () => {
  const screen = await render(<ViewPanel />)
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('id', 'rail-panel-preview')
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'rail-tab-preview')
})
