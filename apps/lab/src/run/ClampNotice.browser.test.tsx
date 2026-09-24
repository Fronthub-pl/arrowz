import { dictionary } from '@arrowz/engine/i18n'
import { act, useRef } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { ClampNotice } from './ClampNotice'

const EN = dictionary('en')

function Host({
  goDisabled = false,
  withAbort = false,
  abortDisabled = false,
}: {
  goDisabled?: boolean
  withAbort?: boolean
  abortDisabled?: boolean
}) {
  const go = useRef<HTMLButtonElement>(null)
  const abort = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button type="button" ref={go} disabled={goDisabled}>
        Generate
      </button>
      {withAbort ? (
        <button type="button" ref={abort} disabled={abortDisabled}>
          Abort
        </button>
      ) : null}
      <ClampNotice focusOnDismiss={go} focusOnAbort={withAbort ? abort : undefined} />
    </>
  )
}

beforeEach(() => useStore.getState().ui.raiseClamped(false))

describe('ClampNotice', () => {
  // Mounted from the start, only its content moves: a live region inserted
  // already-populated announces nothing in most screen readers.
  it('keeps its region on the page while it has nothing to say', async () => {
    const screen = await render(<Host />)
    await expect.element(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('status').element().textContent).toBe('')
  })

  it('fills the region when a value was pulled into range', async () => {
    const screen = await render(<Host />)
    useStore.getState().ui.raiseClamped(true)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('clamped'))
  })

  it('empties on dismiss and hands focus back rather than dropping it', async () => {
    const screen = await render(<Host />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(useStore.getState().ui.clamped).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element())
  })

  // A preset both clamps a value and starts a run, and Generate is disabled
  // while the run lasts; `focus()` on a disabled button is a no-op, so
  // `document.body` is the assertion that discriminates.
  it('keeps the focus in the page when the action it hands to is refused', async () => {
    const screen = await render(<Host goDisabled />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('status').element())
  })

  // Abort, not the region: the region is empty and unnamed, so a screen reader
  // announces nothing there, while Abort is visible and named.
  it('hands focus to Abort when Generate is disabled and Abort is not', async () => {
    const screen = await render(<Host goDisabled withAbort />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abort' }).element())
  })

  // A link that clamps a value and breaks a rule leaves neither button live.
  // This case holds the `!abort.disabled` half of the guard: without it the
  // focus is lost to <body> when the dismissed button unmounts.
  it('falls back to its own region when Abort is refused as well', async () => {
    const screen = await render(<Host goDisabled withAbort abortDisabled />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('status').element())
  })

  // Replaced by the outcome of the next load, not stacked with it. Each write is
  // wrapped in `act`: a store write from outside a React event renders on a
  // microtask at the earliest, so a synchronous read would pass a latching
  // implementation. The raise is asserted first so a never-filled region fails.
  it('is lowered again by a load that had nothing to clamp', async () => {
    const screen = await render(<Host />)
    await act(async () => useStore.getState().ui.raiseClamped(true))
    expect(screen.getByRole('status').element().textContent).toContain(EN.t('clamped'))
    await act(async () => useStore.getState().ui.raiseClamped(false))
    expect(screen.getByRole('status').element().textContent).toBe('')
  })
})
