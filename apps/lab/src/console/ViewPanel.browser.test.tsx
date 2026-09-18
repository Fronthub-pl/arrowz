import { VIEW_RANGE } from '@arrowz/engine/command'
import { beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ViewFlagSwitch, ViewNumberField, ViewPanel } from './ViewPanel'

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
  // 200 is the CLI's ceiling, and now the field's own as well, so the box that
  // shows the clamped value is not `:invalid` for showing it.
  expect(view().cell).toBe(200)
  expect(screen.container.querySelector<HTMLInputElement>('#view-cell')?.checkValidity()).toBe(true)
  await expect.element(cell).toHaveValue(200)
})

test('every number field declares the bounds the engine actually takes', async () => {
  // The only guard that the lab's number fields stay inside the engine's
  // table. It checks the rendered attributes rather than the `VIEW_FIELDS`
  // table, because the table no longer carries bounds: what a person and a
  // screen reader are told is what the DOM says, and that is what has to agree
  // with `VIEW_RANGE`.
  const screen = await render(<ViewPanel />)
  const fields = [...screen.container.querySelectorAll<HTMLInputElement>('input[type="number"]')]
  expect(fields).toHaveLength(Object.keys(VIEW_RANGE).length)
  for (const input of fields) {
    const key = input.id.replace(/^view-/, '') as keyof typeof VIEW_RANGE
    const range = VIEW_RANGE[key]
    expect(range, `no VIEW_RANGE entry for ${input.id}`).toBeDefined()
    expect(Number(input.min)).toBe(range.min)
    expect(Number(input.max)).toBe(range.max)
    // Not just "in range": a field is `:invalid` on a value off its own step
    // too, and the default it opens with must not be one.
    expect(input.checkValidity(), `${input.id} opens invalid at ${input.value}`).toBe(true)
  }
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

// Ruling 2: the field is the caller's now. A second owner (the library's
// detail, Task 6) gives it a different value and a different sink, and the
// clamp has to happen inside the field — otherwise each owner would have to
// remember to clamp, and one of them would not.
test('a field hands its owner an already-clamped number', async () => {
  let got = null as number | null
  const screen = await render(
    <ViewNumberField
      field={{ field: 'stroke', label: 'strokeLabel', step: 0.05 }}
      value={0.5}
      onCommit={(v) => (got = v)}
    />,
  )
  const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
  await userEvent.fill(stroke, '9')
  await userEvent.tab()
  // 2 is `VIEW_RANGE.stroke.max`; the owner never sees the 9 that was typed.
  expect(got).toBe(2)
  // And the lab's own slice was not touched by a field nobody pointed at it.
  expect(view().stroke).toBe(0.5)
})

test('a flag switch reports a press without writing any store', async () => {
  let presses = 0
  const screen = await render(
    <ViewFlagSwitch flag="colored" label="colored" on={false} onToggle={() => (presses += 1)} />,
  )
  await screen.getByRole('switch', { name: /colour the arrows/i }).click()
  expect(presses).toBe(1)
  expect(view().colored).toBe(false)
})
