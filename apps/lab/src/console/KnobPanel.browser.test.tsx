import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { KnobPanel } from './KnobPanel'

const params = () => useStore.getState().params

test('a panel draws every knob of its group', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="shape" />)
  // Four knobs in shape: pStraight, wLateral, warns, anticoil.
  expect(screen.container.querySelectorAll('.fw-k')).toHaveLength(4)
  await expect.element(screen.getByText('coiling penalty')).toBeVisible()
})

test('the panel names its group and is the tabpanel the rail points at', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="skeleton" />)
  const panel = screen.getByRole('tabpanel')
  await expect.element(panel).toHaveAttribute('id', 'rail-panel-skeleton')
  await expect.element(panel).toHaveAttribute('aria-labelledby', 'rail-tab-skeleton')
})

test('the difficulty group shows one start control, not two knobs', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="difficulty" />)
  // headBias and mix share --start, so the group's five specs become four
  // controls: the start control, trapBias, probe, probeLen.
  await expect.element(screen.getByRole('combobox', { name: /piece start/i })).toBeVisible()
  expect(screen.container.querySelectorAll('#knob-headBias')).toHaveLength(0)
  expect(screen.container.querySelectorAll('#knob-mix')).toHaveLength(0)
})

test('every knob in PARAM_SPEC is reachable from exactly one panel', async () => {
  params().reset()
  const groups = [...new Set(PARAM_SPEC.map((s) => s.group))]
  const drawn = new Set<string>()
  for (const group of groups) {
    const screen = await render(<KnobPanel group={group} />)
    for (const el of screen.container.querySelectorAll('[id^="knob-"]')) {
      const key = el.id.replace('knob-', '')
      expect(drawn.has(key)).toBe(false)
      drawn.add(key)
    }
  }
  // headBias and mix are behind the start control; mix appears only while
  // mixing is chosen, and the defaults spell `random`.
  const expected = PARAM_SPEC.filter((s) => s.surface !== 'start').map((s) => s.key)
  for (const key of expected) expect(drawn.has(key)).toBe(true)
})

test('a group with help prints it under the heading', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="closing" />)
  await expect.element(screen.getByText(/no legal carve/)).toBeVisible()
})
