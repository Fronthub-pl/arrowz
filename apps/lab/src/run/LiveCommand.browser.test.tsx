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

beforeEach(() => useStore.getState().params.reset())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('LiveCommand', () => {
  // The lab is a layer over the CLI: the box shows what `carve` would be run
  // with, from the knobs on screen and not from the board drawn.
  it('is exactly what buildCommand builds for the knobs on screen', async () => {
    useStore.getState().params.setMany({ W: 30, H: 60, seed: 7 })
    const screen = await render(<LiveCommand />)
    await expect.poll(() => screen.container.querySelector('.fw-cmd')?.textContent).toBe(commandNow())
  })

  it('follows a preview field, which changes the command without generating', async () => {
    const screen = await render(<LiveCommand />)
    useStore.getState().view.setNumber('stroke', '0.4')
    await expect.element(screen.getByRole('figure')).toMatchTextContent(/--line=0\.4/)
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
    const rejections: PromiseRejectionEvent[] = []
    const onRejection = (e: PromiseRejectionEvent) => rejections.push(e)
    window.addEventListener('unhandledrejection', onRejection)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: () => Promise.reject(new Error('denied')),
    } as unknown as Clipboard)
    const screen = await render(<LiveCommand />)
    await screen.getByRole('button', { name: 'Copy' }).click()
    await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    window.removeEventListener('unhandledrejection', onRejection)
    expect(rejections).toHaveLength(0)
  })
})
