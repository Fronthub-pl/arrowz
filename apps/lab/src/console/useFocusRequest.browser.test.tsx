import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import { cancelFlash } from './flash'

beforeEach(() => {
  cancelFlash()
})

describe('a jump from the palette', () => {
  it('brings the knob group, focuses the control and outlines it', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    // Bare "seed" also matches the run section's "New seed" row (its own hay
    // is literally 'seed'), which sits first in the built list (pinned by
    // commands.test.ts's "opens with the run actions..." case) and would
    // steal Enter. The flag disambiguates, exactly as commands.ts's own `hay`
    // doc comment says it does ("how `--seed` finds the seed knob").
    await userEvent.keyboard('--seed')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => useStore.getState().ui.palette).toBe(false)
    await expect.poll(() => document.activeElement?.id).toBe('knob-seed')
    // The request is consumed, so a later render cannot steal the focus again.
    expect(useStore.getState().ui.focusTarget).toBe(null)
    const knob = screen.container.querySelector('#knob-seed')?.closest('.fw-k')
    expect(knob?.classList.contains('flash')).toBe(true)
  }, 40_000)

  it('leaves the simple view for the one that has knobs', async () => {
    await page.viewport(1400, 900)
    await mountApp('simple')
    await loadRunDone()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    // Same disambiguation as above.
    await userEvent.keyboard('--seed')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => useStore.getState().ui.mode).toBe('advanced')
    await expect.poll(() => document.activeElement?.id).toBe('knob-seed')
  }, 40_000)

  it('reaches a preview field and a preview switch, which live in the other panel', async () => {
    await page.viewport(1400, 900)
    await mountApp('advanced')
    await loadRunDone()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('stroke width')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => document.activeElement?.id).toBe('view-stroke')
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('colour the arrows')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => document.activeElement?.id).toBe('view-colored')
  }, 40_000)
})
