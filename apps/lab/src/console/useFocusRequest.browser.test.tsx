import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { settleTransitions } from '../harness/settle'
import { useStore } from '../state/store'
import { cancelFlash } from './flash'
// The cascade `main.tsx` loads, in its order: the S and XS cases below read
// whether the knob is on screen, and with no stylesheet every node is.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/library.css'
import '../design/run.css'
import '../design/report.css'
import '../design/docs.css'
import '../design/palette.css'

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
    const knob = screen.container.querySelector('#knob-seed')?.closest('.kv-row')
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

  // Spec §6: ⌘K is bound on every route, and the knobs are the lab face's
  // alone — `/boards` puts the library where the knob panel goes, so before
  // the jump navigated, the request was spent against a panel that has no
  // `#knob-seed` and the palette closed on nothing at all.
  it('comes back from the saved boards to the lab face, and still lands on the knob', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await screen.getByRole('tab', { name: 'Saved boards', exact: true }).click()
    await expect.poll(() => screen.container.querySelector('#boards-panel') !== null).toBe(true)
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('--seed')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => screen.container.querySelector('#lab-panel') !== null).toBe(true)
    await expect.poll(() => document.activeElement?.id).toBe('knob-seed')
  }, 40_000)

  // The other face with no knobs: under `/docs/*` the whole workspace is a
  // `<main hidden>`, so `focus()` on a node inside it is a no-op.
  it('comes back from the documentation to the lab face, and still lands on the knob', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
    await expect
      .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
      .toBe(true)
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('--seed')
    await userEvent.keyboard('{Enter}')
    await expect
      .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
      .toBe(false)
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

  // Final review F1: below 1024 the settings drawer starts closed (spec D3),
  // and at XS the console is not rendered until its sheet opens, so a jump
  // that only selected the group focused nothing a person could see.
  it.each([
    [900, 900],
    [375, 812],
  ] as const)(
    'opens what holds the knob at %d×%d, so the knob is on screen and focused',
    async (w, h) => {
      await page.viewport(w, h)
      const screen = await mountApp('advanced')
      await loadRunDone()
      await act(async () => useStore.getState().ui.setSettings(false))
      // Wait out the drawer's slide: until it ends the console is still
      // visible and a focus lands in the drawer that is on its way out.
      await settleTransitions()
      await userEvent.keyboard('{Meta>}k{/Meta}')
      await userEvent.keyboard('seed')
      await userEvent.keyboard('{Enter}')
      await expect.poll(() => useStore.getState().ui.palette).toBe(false)
      const knob = () => screen.container.querySelector('#knob-seed')
      await expect.poll(() => knob()?.checkVisibility({ visibilityProperty: true })).toBe(true)
      // Rendered is not enough at S: the closed drawer keeps the knob a box,
      // translated off the stage and covered by the board (measured at 900
      // before the fix: rendered, focused, and under the board). What is at
      // the knob's centre must be the knob's own row.
      await expect
        .poll(() => {
          const node = knob()
          if (node === null) return false
          const r = node.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return hit !== null && node.closest('.kv-row')?.contains(hit) === true
        })
        .toBe(true)
      await expect.poll(() => document.activeElement === knob()).toBe(true)
    },
    40_000,
  )
})
