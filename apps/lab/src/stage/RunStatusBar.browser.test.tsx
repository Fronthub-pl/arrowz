import { dictionary } from '@arrowz/engine/i18n'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { RunStatusBar } from './RunStatusBar'

const EN = dictionary('en')

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
})

describe('RunStatusBar', () => {
  // Ruling 13: `auto` and a pasted link have no disabled button to look at,
  // and on /boards there is no Violations panel either.
  it('says the run is refused while a rule is broken', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generateBlocked'))
  })

  it('goes back to the prompt when the rule is satisfied again', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunStatusBar />)
    useStore.getState().params.setMany({ wShort: 0.3, wMid: 0.3 })
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('pressGenerate'))
  })

  // The old lab warns before a carve that will take a while (lab-page.ts:882);
  // spec §10 lists it among the features the port must restore.
  it('warns for a board over 200 000 cells, and not for a small one', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 600, H: 600 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(/600×600/)
  })

  it("keeps naming the run's own size after a knob moves during the carve", async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 600, H: 600 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    // The console's own knobs move to a small size while the run is still in
    // flight. A component that (wrongly) read the live knobs instead of
    // `run.params` would now print the plain `generating` text; this must
    // still name the run's own 600×600.
    useStore.getState().params.setMany({ W: 25, H: 25 })
    await expect.element(screen.getByRole('status')).toMatchTextContent(/600×600/)
  })

  it('says only "Generating…" for a board under the threshold', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 25, H: 25 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generating'))
  })
})
