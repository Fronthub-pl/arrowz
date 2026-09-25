import { MIX_START, START } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { StartKnob } from './StartKnob'

const params = () => useStore.getState().params

test('the control offers the four words and follows the two knobs', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  const select = screen.getByRole('combobox', { name: /arrow start/i })
  for (const word of ['layers', 'random', 'tunnels', 'mix']) {
    await expect.element(screen.getByRole('option', { name: word })).toBeInTheDocument()
  }
  // The defaults are headBias 0 and mix -1, which `START.words` spells
  // `random`, not `layers` (headBias -1).
  await expect.element(select).toHaveValue('random')
})

test('choosing a word writes both knobs behind the flag', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'tunnels')
  expect(params().values.headBias).toBe(START.words.tunnels.headBias)
  expect(params().values.mix).toBe(START.words.tunnels.mix)
})

test('the share row appears only on mixing, and only inside what --start spells', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  expect(screen.container.querySelectorAll('#knob-mix')).toHaveLength(0)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'mixing')
  expect(params().values.mix).toBe(MIX_START)
  const share = screen.container.querySelector('#knob-mix')
  // The knob's own range starts at -1; only 0.3..0.7 is a share.
  expect(share?.getAttribute('min')).toBe(String(START.mix.min))
  expect(share?.getAttribute('max')).toBe(String(START.mix.max))
})

test('switching away and back keeps a share the flag can still spell', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'mixing')
  params().set('mix', 0.6)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'layers')
  await userEvent.selectOptions(screen.getByRole('combobox'), 'mixing')
  expect(params().values.mix).toBe(MIX_START)
  // layers wrote mix = -1, which is not a share, so mixing takes the middle
  // again rather than printing a command the CLI refuses.
})

test('the start control is a knob row with its own description', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  const select = screen.getByRole('combobox', { name: 'arrow start' })
  expect(select.element().closest('.kv-row .cc')).not.toBeNull()
  await expect.element(select).toHaveAttribute('aria-describedby', 'knob-start-desc')
  const q = screen.getByRole('button', { name: 'About arrow start' })
  await expect.element(q).toHaveAttribute('aria-controls', 'knob-start-desc')
  expect(document.getElementById('knob-start-desc')?.closest('.kv-row')).not.toBeNull()
})
