import type { Params } from '@fronthub/arrowz-engine'
import { dictionary } from '@fronthub/arrowz-engine/i18n'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { settleTransitions } from '../harness/settle'
import { readBand } from '../state/band'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
// The cascade `main.tsx` loads: the S and XS cases read whether the knob is on screen.
import '../design/index.css'

const en = dictionary('en')
const ONE = finishedRun(1)

/** Two results, the second made with `patch`, and the report open: a sheet at XS, the drawer elsewhere. */
async function twoResults(patch: Partial<Params>) {
  await act(async () => {
    finish(ONE)
    finish({ ...ONE, params: { ...ONE.params, ...patch } })
    const ui = useStore.getState().ui
    if (readBand() === 'xs') ui.setSheet('report')
    else ui.setReport(true)
  })
}

const seedRow = () => en.t('knobDiffRow', en.d.short.seed, en.d.groups.board, '1', '2')

describe('a changed knob in the report', () => {
  it('opens the closed block that holds the knob, focuses it and outlines its row', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    // From the defaults `probe` is 0, so `dep-probe` is closed, and the group on screen is `board`.
    await twoResults({ probeLen: 30 })
    const name = en.t('knobDiffRow', en.d.short.probeLen, en.d.groups.difficulty, '12 cells', '30 cells')
    await screen.getByRole('button', { name, exact: true }).click()
    await expect.poll(() => document.activeElement?.id).toBe('knob-probeLen')
    expect(useStore.getState().ui.entry).toBe('difficulty')
    expect(useStore.getState().ui.focusTarget).toBe(null)
    expect(document.getElementById('dep-probe')?.hidden).toBe(false)
    expect(document.getElementById('knob-probeLen')?.closest('.kv-row')?.classList.contains('flash')).toBe(true)
  }, 40_000)

  it('leaves the simple view for the one that has the knob', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('simple')
    await loadRunDone()
    await twoResults({ seed: 2 })
    await screen.getByRole('button', { name: seedRow(), exact: true }).click()
    await expect.poll(() => useStore.getState().ui.mode).toBe('advanced')
    await expect.poll(() => document.activeElement?.id).toBe('knob-seed')
  }, 40_000)

  it('lands on the start control for the pair behind --start', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await twoResults({ headBias: 1 })
    const name = en.t('knobDiffRow', en.d.short.headBias, en.d.groups.difficulty, 'random', 'tunnels')
    await screen.getByRole('button', { name, exact: true }).click()
    await expect.poll(() => document.activeElement?.id).toBe('knob-start')
  }, 40_000)

  // The knob shows the store's value, so the store holds the result's here:
  // the row's word and the select's can then be compared.
  it('names a choice the way the knob it lands on shows it', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await act(async () => useStore.getState().params.setMany({ trapBias: 1 }))
    await twoResults({ trapBias: 1 })
    const seek = en.choiceText('trapBias', 'seek')
    const name = en.t(
      'knobDiffRow',
      en.d.short.trapBias,
      en.d.groups.difficulty,
      en.choiceText('trapBias', 'off'),
      seek,
    )
    await screen.getByRole('button', { name, exact: true }).click()
    await expect.poll(() => document.activeElement?.id).toBe('knob-trapBias')
    const select = document.activeElement
    if (!(select instanceof HTMLSelectElement)) throw new Error('the traps knob is not a select')
    expect(select.selectedOptions[0]?.textContent).toBe(seek)
  }, 40_000)

  // Below 1024 the settings drawer starts closed, and at XS the report is a
  // sheet the settings sheet replaces (see `jumpTo`).
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
      await twoResults({ seed: 2 })
      // Wait out the slides: a focus taken mid-slide lands in a drawer on its way out.
      await settleTransitions()
      const row = [...document.querySelectorAll<HTMLButtonElement>('.fw-kdiff button')].find(
        (button) => button.getAttribute('aria-label') === seedRow(),
      )
      if (row === undefined) throw new Error('no seed row in the report')
      // A DOM click: a locator click waits for a visibility the band decides.
      await act(async () => row.click())
      if (w === 375) expect(useStore.getState().ui.sheet).toBe('settings')
      const knob = () => screen.container.querySelector('#knob-seed')
      await expect.poll(() => knob()?.checkVisibility({ visibilityProperty: true })).toBe(true)
      // What is at the knob's centre must be its own row, not the report beside it.
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
