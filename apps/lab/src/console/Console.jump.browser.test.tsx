import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { twoFrames } from '../harness/frames'
import { useStore } from '../state/store'

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
    // From the defaults `highlightLongest` is false, so `dep-highlight-longest` starts closed.
    await mountApp()
    await loadRunDone()
    await act(async () => {
      useStore.getState().ui.select('preview')
      useStore.getState().ui.requestFocus('view-top')
    })
    expect(document.activeElement?.id).toBe('view-top')
    expect(document.getElementById('dep-highlight-longest')?.hidden).toBe(false)
    await act(async () => {
      useStore.getState().params.set('seed', 8)
    })
    await twoFrames()
    expect(document.activeElement?.id).toBe('view-top')
    expect(document.getElementById('dep-highlight-longest')?.hidden).toBe(false)
  })
})

describe('a palette jump to the colour fields', () => {
  it('lands on the add button of an empty palette, and on the first colour of a full one', async () => {
    // From the defaults the palette starts empty.
    await mountApp()
    await loadRunDone()
    await act(async () => {
      useStore.getState().ui.select('preview')
      useStore.getState().ui.requestFocus('view-palette')
    })
    expect(document.activeElement?.id).toBe('view-palette')
    await act(async () => {
      useStore.getState().view.setPalette(Array.from({ length: 8 }, () => '#112233'))
      useStore.getState().ui.requestFocus('view-palette-0')
    })
    expect(document.activeElement?.id).toBe('view-palette-0')
  })

  it('opens the dots block for the dot colour and keeps the focus there past the next render', async () => {
    // From the defaults `showPoints` is false, so `dep-points` starts closed.
    await mountApp()
    await loadRunDone()
    await act(async () => {
      useStore.getState().ui.select('preview')
      useStore.getState().ui.requestFocus('view-pointColor')
    })
    expect(document.activeElement?.id).toBe('view-pointColor')
    await act(async () => useStore.getState().params.set('seed', 8))
    await twoFrames()
    expect(document.activeElement?.id).toBe('view-pointColor')
    expect(document.getElementById('dep-points')?.hidden).toBe(false)
  })

  it('lands on the highlight colour', async () => {
    await mountApp()
    await loadRunDone()
    await act(async () => {
      useStore.getState().ui.select('preview')
      useStore.getState().ui.requestFocus('view-highlightColor')
    })
    expect(document.activeElement?.id).toBe('view-highlightColor')
  })
})
