import { DEFAULT_PAD } from '@arrowz/board-element'
import { buildCommand } from '@arrowz/engine/command'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { LiveCommand } from './LiveCommand'

function commandNow() {
  const state = useStore.getState()
  return buildCommand(state.params.values, viewOf(state.view))
}

let cleanupListeners: Array<() => void> = []

/** Watches a `window` event for the rest of the current test, torn down in `afterEach`. */
function watch(type: string) {
  const events: Event[] = []
  const handler = (e: Event) => events.push(e)
  window.addEventListener(type, handler)
  cleanupListeners.push(() => window.removeEventListener(type, handler))
  return events
}

beforeEach(() => useStore.getState().params.reset())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  useStore.getState().view.setPad(DEFAULT_PAD)
  for (const cleanup of cleanupListeners) cleanup()
  cleanupListeners = []
})

describe('LiveCommand', () => {
  // The lab is a layer over the CLI: the box shows what `carve` would be run
  // with, from the knobs on screen and not from the board drawn.
  it('is exactly what buildCommand builds for the knobs on screen', async () => {
    useStore.getState().params.setMany({ W: 30, H: 60, seed: 7 })
    const screen = await render(<LiveCommand />)
    await expect.poll(() => screen.container.querySelector('.fw-cmd')?.textContent).toBe(commandNow())
    // One span per flag and the value in bold, not the command as one plain string.
    expect(screen.container.querySelectorAll('.fw-cmd > .ln').length).toBeGreaterThan(1)
    expect([...screen.container.querySelectorAll('.fw-cmd b')].map((b) => b.textContent)).toContain('30')
  })

  it('follows a preview field, which changes the command without generating', async () => {
    const screen = await render(<LiveCommand />)
    useStore.getState().view.setNumber('stroke', '0.4')
    await expect.element(screen.getByRole('figure')).toMatchTextContent(/--line=0\.4/)
  })

  // The margin is a screen-only setting — `viewOf` never reads `view.pad` —
  // so changing it must leave the command exactly as it was.
  it('does not change when the margin changes, a screen-only setting', async () => {
    useStore.getState().params.setMany({ W: 30, H: 60, seed: 7 })
    const screen = await render(<LiveCommand />)
    useStore.getState().view.setPad(9)
    // A poll against the old text could pass before React re-renders. Changing
    // a field the command does show, and waiting for it, forces a render that
    // reflects both writes; only then is comparing with `commandNow()` meaningful.
    useStore.getState().view.setNumber('stroke', '0.4')
    await expect.element(screen.getByRole('figure')).toMatchTextContent(/--line=0\.4/)
    expect(screen.container.querySelector('.fw-cmd')?.textContent).toBe(commandNow())
  })

  it('copies the whole command, prefix included', async () => {
    const write = vi.fn(() => Promise.resolve())
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
    const screen = await render(<LiveCommand />)
    const expected = commandNow()
    await screen.getByRole('button', { name: 'Copy' }).click()
    expect(write).toHaveBeenCalledWith(expected)
  })

  it('says it copied, and stops saying so', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: () => Promise.resolve(),
    } as unknown as Clipboard)
    const screen = await render(<LiveCommand />)
    await screen.getByRole('button', { name: 'Copy' }).click()
    await expect.element(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('stays on its normal label, and raises no unhandled rejection, when the browser refuses the copy', async () => {
    const rejections = watch('unhandledrejection')
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: () => Promise.reject(new Error('denied')),
    } as unknown as Clipboard)
    const screen = await render(<LiveCommand />)
    await screen.getByRole('button', { name: 'Copy' }).click()
    await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(rejections).toHaveLength(0)
  })

  it('stays on its normal label, and raises no uncaught error, outside a secure context', async () => {
    // Outside a secure context `navigator.clipboard` is `undefined`, so
    // `.writeText` throws while being looked up, before any promise exists.
    const errors = watch('error')
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard)
    const screen = await render(<LiveCommand />)
    await screen.getByRole('button', { name: 'Copy' }).click()
    await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(errors).toHaveLength(0)
  })
})
