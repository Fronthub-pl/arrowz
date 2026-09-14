import { type ParamKey, PARAM_SPEC } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, describe, expect, it, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { KnobPanel } from './KnobPanel'
// The help switch hides a description with `.fw-vh` (Task 9); a component
// test renders no other route to the stylesheet, so it must import it itself
// to see the same clipping the app would apply.
import '../design/console.css'

// File scope, the way this repository's other browser files open one (see
// `RunColumn.browser.test.tsx`, whose own file-scope block resets the same
// four things). A
// reset inside a describe leaves every case declared above the block running
// on whatever the case before it happened to leave behind: that is how
// `a group with help prints it under the heading` came to pass only because it
// is declared first and `ui.help` defaults true.
beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.setAuto(false)
  state.ui.setHelp(true)
})

const EN = dictionary('en')
function helpFor(key: ParamKey) {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (spec === undefined) throw new Error(`PARAM_SPEC has no ${key}`)
  return EN.paramText(spec).help
}

test('a panel draws every knob of its group', async () => {
  const screen = await render(<KnobPanel group="shape" />)
  // Four knobs in shape: pStraight, wLateral, warns, anticoil.
  expect(screen.container.querySelectorAll('.fw-k')).toHaveLength(4)
  await expect.element(screen.getByText('coiling penalty')).toBeVisible()
})

test('the panel names its group and is the tabpanel the rail points at', async () => {
  const screen = await render(<KnobPanel group="skeleton" />)
  const panel = screen.getByRole('tabpanel')
  await expect.element(panel).toHaveAttribute('id', 'rail-panel-skeleton')
  await expect.element(panel).toHaveAttribute('aria-labelledby', 'rail-tab-skeleton')
})

test('the difficulty group shows one start control, not two knobs', async () => {
  const screen = await render(<KnobPanel group="difficulty" />)
  // headBias and mix share --start, so the group's five specs become four
  // controls: the start control, trapBias, probe, probeLen.
  await expect.element(screen.getByRole('combobox', { name: /piece start/i })).toBeVisible()
  expect(screen.container.querySelectorAll('#knob-headBias')).toHaveLength(0)
  expect(screen.container.querySelectorAll('#knob-mix')).toHaveLength(0)
})

test('every knob in PARAM_SPEC is reachable from exactly one panel', async () => {
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
  const screen = await render(<KnobPanel group="closing" />)
  await expect.element(screen.getByText(/no legal carve/)).toBeVisible()
})

describe('the help switch', () => {
  it('shows every description while it is on', async () => {
    useStore.getState().ui.setHelp(true)
    const screen = await render(<KnobPanel group="board" />)
    const desc = screen.getByText(helpFor('W')).element()
    // The switch is on: nothing clips the description away.
    expect(getComputedStyle(desc).clipPath).toBe('none')
  })

  // Measured, not `toBeVisible()`: that matcher reads the bounding rect, which
  // a 1x1px clipped box still has, so it cannot tell `.fw-vh` apart from an
  // element that merely happens to be small. `clipPath`/`position` are the
  // properties the CSS actually sets, so they are what a reversal would break.
  it('hides the descriptions from the eye when it is off', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="board" />)
    const desc = screen.getByText(helpFor('W')).element()
    const style = getComputedStyle(desc)
    expect(style.clipPath).toBe('inset(50%)')
    expect(style.position).toBe('absolute')
  })

  it('keeps the description in the accessibility tree when it is off', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="board" />)
    const described = screen.container.querySelector('#knob-W-why')
    expect(described?.textContent).toContain(helpFor('W'))
    // `textContent` alone would stay unchanged under `display: none` too —
    // that gap is what let a `display: none` "simplification" through with a
    // green suite. `display`/`visibility` are what actually govern whether an
    // element leaves the accessibility tree.
    const desc = screen.getByText(helpFor('W')).element()
    const style = getComputedStyle(desc)
    expect(style.display).not.toBe('none')
    expect(style.visibility).not.toBe('hidden')
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
    // The brief calls this ordering a behaviour worth keeping: the split
    // would currently survive a reversal (description before reason)
    // unnoticed by every other assertion in this file.
    const paragraph = why.element()
    const stateSpan = paragraph.querySelector('.state')
    const descSpan = paragraph.querySelector('.desc')
    if (stateSpan === null || descSpan === null) throw new Error('expected both spans')
    const children = [...paragraph.children]
    expect(children.indexOf(stateSpan)).toBeLessThan(children.indexOf(descSpan))
  })

  it('hides the group description too', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="lengths" />)
    expect(screen.container.textContent).not.toContain(EN.d.groupHelp.lengths)
  })
})
