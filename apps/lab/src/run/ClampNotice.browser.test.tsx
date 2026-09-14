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
  // A live region inserted already-populated announces nothing in most screen
  // readers; the region is mounted from the start and only its content moves,
  // which is what `RunStatusBar` already does.
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

  // The state this notice actually appears in: a preset both clamps a value
  // and starts a run, and Generate is disabled for as long as that run lasts.
  // `focus()` on a disabled button is a no-op, so a keyboard user dismissing
  // during a long carve used to land on <body> and restart from the top of the
  // document. `document.body` is the assertion that discriminates — the
  // element the old code reached.
  it('keeps the focus in the page when the action it hands to is refused', async () => {
    const screen = await render(<Host goDisabled />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('status').element())
  })

  // The state Abort exists to catch: a preset both clamps a value and starts
  // a run, which disables Generate for as long as that run lasts but leaves
  // Abort live. Landing on the empty, unnamed region was technically "not
  // <body>", but a screen reader announced nothing there and the focus
  // outline painted on a collapsed grid row — Abort is visible, named and
  // inside the run column, so it is where the fallback should go first.
  it('hands focus to Abort when Generate is disabled and Abort is not', async () => {
    const screen = await render(<Host goDisabled withAbort />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abort' }).element())
  })

  // Both refused at once, which the two conditions plainly allow: Generate is
  // out on `running || blocked` and Abort is in on `running` alone, so a link
  // that clamps a value *and* breaks a rule leaves neither live. The region is
  // the last resort, and this is the case that holds the `!abort.disabled`
  // half of the guard down — without it `abort.focus()` is a no-op on a
  // disabled button, nothing else takes the focus, and the dismissed button
  // unmounts from under it onto <body>.
  it('falls back to its own region when Abort is refused as well', async () => {
    const screen = await render(<Host goDisabled withAbort abortDisabled />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('status').element())
  })

  // Replaced by the outcome of the next load, not stacked with it: the old
  // lab's `showClamped(clamped)` takes a boolean for exactly this reason.
  //
  // Each write is wrapped in `act`, as `useAutoRun.browser.test.tsx` wraps its
  // own: a store write from outside a React event reaches the DOM on a
  // microtask at the earliest, so a synchronous read after it sees the render
  // before it — and an implementation that latched, raising once and never
  // lowering, would pass. The raise is asserted before the lower for the same
  // reason: without it the case is equally true of a region never filled.
  it('is lowered again by a load that had nothing to clamp', async () => {
    const screen = await render(<Host />)
    await act(async () => useStore.getState().ui.raiseClamped(true))
    expect(screen.getByRole('status').element().textContent).toContain(EN.t('clamped'))
    await act(async () => useStore.getState().ui.raiseClamped(false))
    expect(screen.getByRole('status').element().textContent).toBe('')
  })
})
