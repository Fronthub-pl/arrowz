import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { useStore } from '../state/store'

// The shortest wait for "a later render happened"; see `twoFrames` in
// `RunColumn.browser.test.tsx`.
const twoFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

describe('a palette jump into a closed dependency block', () => {
  it('keeps the difficulty block open and the knob focused past the next render', async () => {
    await mountApp()
    await loadRunDone()
    // From the defaults `probe` is 0, so `dep-probe` starts closed: the jump
    // has to force it open on its own, not ride along with the parent already on.
    await act(async () => {
      useStore.getState().ui.select('difficulty')
      useStore.getState().ui.requestFocus('knob-probeLen')
    })
    expect(document.activeElement?.id).toBe('knob-probeLen')
    expect(document.getElementById('dep-probe')?.hidden).toBe(false)
    // `useFocusRequest` already spent the request in the act() above, so this
    // checks the block does not snap shut once `forced` alone stops being true.
    await act(async () => {
      useStore.getState().params.set('seed', 8)
    })
    await twoFrames()
    expect(document.activeElement?.id).toBe('knob-probeLen')
    expect(document.getElementById('dep-probe')?.hidden).toBe(false)
  })

  it('keeps the highlight block open and the field focused past the next render', async () => {
    const hilite = useStore.getState().view.hilite
    useStore.getState().view.setFlag('hilite', false)
    try {
      await mountApp()
      await loadRunDone()
      await act(async () => {
        useStore.getState().ui.select('preview')
        useStore.getState().ui.requestFocus('view-top')
      })
      expect(document.activeElement?.id).toBe('view-top')
      expect(document.getElementById('dep-hilite')?.hidden).toBe(false)
      await act(async () => {
        useStore.getState().params.set('seed', 8)
      })
      await twoFrames()
      expect(document.activeElement?.id).toBe('view-top')
      expect(document.getElementById('dep-hilite')?.hidden).toBe(false)
    } finally {
      // `resetApp` does not reset the view slice: put the flag back for
      // whichever file runs next.
      useStore.getState().view.setFlag('hilite', hilite)
    }
  })
})
