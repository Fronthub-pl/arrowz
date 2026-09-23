import { PARAM_SPEC, type Violation } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ChoiceKnob } from './ChoiceKnob'

const trapBias = PARAM_SPEC.find((s) => s.key === 'trapBias')
if (!trapBias || trapBias.control?.kind !== 'choice') throw new Error('trapBias is no longer a choice knob')
const choices = trapBias.control.choices
const EN = dictionary('en')

test('the knob offers exactly the words the flag takes', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  const select = screen.getByRole('combobox', { name: /trap/i })
  await expect.element(select).toHaveValue('0')
  for (const choice of choices) {
    await expect.element(screen.getByRole('option', { name: choice.word })).toBeInTheDocument()
  }
})

test('choosing a word writes the number behind it', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  await userEvent.selectOptions(screen.getByRole('combobox'), '1')
  expect(useStore.getState().params.values.trapBias).toBe(1)
})

test('an inactive choice knob says why', async () => {
  useStore.getState().params.reset()
  const spacing = PARAM_SPEC.find((s) => s.key === 'giantSpacing')
  if (!spacing || spacing.control?.kind !== 'choice') throw new Error('giantSpacing is no longer a choice knob')
  const screen = await render(<ChoiceKnob spec={spacing} choices={spacing.control.choices} />)
  expect(screen.container.querySelector('.kv-why')?.textContent).toContain('No effect:')
})

// Handoff 2, PR 2: the description is the row's own paragraph, closed until
// its `?` opens it, and never in the state line.
test('a choice knob keeps its description in its row, closed, apart from its state', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  const help = screen.container.querySelector('#knob-trapBias-desc')
  expect(help?.textContent).toBe(EN.paramText(trapBias).help)
  expect(help?.classList.contains('fw-vh')).toBe(true)
  expect(screen.container.querySelector('.kv-why')?.textContent).not.toContain(EN.paramText(trapBias).help)
  await screen.getByRole('button', { name: 'About trap bias' }).click()
  expect(help?.classList.contains('fw-vh')).toBe(false)
})

// The select stands in the control's track, labelled by the short term.
test('the select is in the control track, named by the short term', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  const select = screen.getByRole('combobox', { name: 'trap bias' })
  expect(select.element().closest('.cc')).not.toBeNull()
})

test('a violated choice knob says why, in error colour, and the select points at the reason', async () => {
  useStore.getState().params.reset()
  // No knob combination can reach this today: `params.set` always runs
  // `clampParam`, so a `range` violation can never be stored, and no rule in
  // RULES names `trapBias` or `giantSpacing`. The `broken` branch exists for
  // the malformed input a later PR's URL hash will admit, so it is written
  // straight to the store — past the public API — rather than left unchecked.
  const violation: Violation = { kind: 'range', key: 'trapBias', value: 5, min: -1, max: 1 }
  useStore.setState((state) => ({
    params: { ...state.params, broken: { trapBias: [violation] } },
  }))
  // In a `finally`: the violation above is hand-made and the store outlives the
  // test, so a failing assertion would otherwise leak a broken knob into every
  // test declared after this one.
  try {
    const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
    const why = screen.container.querySelector('.kv-why')
    expect(why?.textContent ?? '').toContain('5 is outside -1..1')
    expect(screen.container.querySelector('.kv-row')?.className).toContain('bad')
    await expect
      .element(screen.getByRole('combobox'))
      .toHaveAttribute('aria-describedby', 'knob-trapBias-why knob-trapBias-desc')
  } finally {
    useStore.getState().params.reset()
  }
})
