import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ChoiceKnob } from './ChoiceKnob'

const trapBias = PARAM_SPEC.find((s) => s.key === 'trapBias')
if (!trapBias || trapBias.control?.kind !== 'choice') throw new Error('trapBias is no longer a choice knob')
const choices = trapBias.control.choices

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
  expect(screen.container.querySelector('.why')?.textContent).toContain('No effect:')
})

test('a choice knob still says what it does', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  // There is no slider here, so this paragraph is the knob's only description.
  expect(screen.container.querySelector('.why')?.textContent).toContain(trapBias.help.slice(0, 24))
})
