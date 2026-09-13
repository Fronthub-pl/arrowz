import { act } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { TopBar } from './TopBar'

beforeEach(() => useStore.getState().params.reset())

describe('TopBar', () => {
  // Spec §5.1 gives the bar "mark, preset name, dims", and the name is the one
  // piece of derived logic in it. The store's defaults are 25×50, which
  // `easy-portrait` spells exactly, so the bar has a preset to name on the
  // first paint. The whole text is asserted, separators and all: the spaces a
  // reader sees around them are `gap`, not characters, and a bar that lost the
  // size or gained a stray label would pass a looser match.
  it('names the preset the knobs spell, beside the size', async () => {
    const screen = await render(<TopBar />)
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/Easy portrait/25×50')
  })

  // The other branch: one knob off a preset and the bar has nothing to name,
  // so the name and its separator both go and the size stays. `act` wraps the
  // write, as `useAutoRun.browser.test.tsx` wraps its own — a store write from
  // outside a React event reaches the DOM on a microtask at the earliest.
  it('drops the name, and its separator with it, when no preset spells the knobs', async () => {
    const screen = await render(<TopBar />)
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/26×50')
  })
})
