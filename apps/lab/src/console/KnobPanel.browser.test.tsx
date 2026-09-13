import { type ParamKey, PARAM_SPEC } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { describe, expect, it, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { KnobPanel } from './KnobPanel'
// The help switch hides a description with `.fw-vh` (Task 9); a component
// test renders no other route to the stylesheet, so it must import it itself
// to see the same clipping the app would apply.
import '../design/console.css'

const params = () => useStore.getState().params
const EN = dictionary('en')
function helpFor(key: ParamKey) {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (spec === undefined) throw new Error(`PARAM_SPEC has no ${key}`)
  return EN.paramText(spec).help
}

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

describe('the help switch', () => {
  it('shows every description while it is on', async () => {
    useStore.getState().ui.setHelp(true)
    const screen = await render(<KnobPanel group="board" />)
    await expect.element(screen.getByText(helpFor('W'))).toBeVisible()
  })

  // Ruling 9: hidden from the eye, kept for a screen reader. `toBeVisible`
  // and not `textContent`, because the text is meant to still be there.
  it('hides the descriptions from the eye when it is off', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="board" />)
    await expect.element(screen.getByText(helpFor('W'))).not.toBeVisible()
  })

  it('keeps the description in the accessibility tree when it is off', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="board" />)
    const described = screen.container.querySelector('#knob-W-why')
    expect(described?.textContent).toContain(helpFor('W'))
  })

  // The whole point of splitting the paragraph. The old lab kept the reason
  // only by accident: `body.nohelp .help { display: none }` hid the element
  // and left its `::before` behind.
  it('keeps a violation visible with the descriptions off', async () => {
    useStore.getState().ui.setHelp(false)
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<KnobPanel group="lengths" />)
    const why = screen.getByTestId('knob-wShort-why')
    await expect.element(why).toBeVisible()
    // `sharesSum` names both wShort and wMid, so wMid's own paragraph carries
    // the identical reason text too — scoped to wShort's paragraph, not the
    // whole panel, so the lookup stays unique rather than merely lenient.
    const violation = useStore.getState().params.violations[0]
    if (violation === undefined) throw new Error('expected a violation')
    await expect.element(why.getByText(EN.violation(violation))).toBeVisible()
  })

  it('hides the group description too', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="lengths" />)
    expect(screen.container.textContent).not.toContain(EN.d.groupHelp.lengths)
  })
})
