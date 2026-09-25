import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MemoryRouter } from 'react-router'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { CommandPalette } from './CommandPalette'
import '../design/tokens.css'
import '../design/palette.css'

const control: RunControl = { start: () => {}, abort: () => {}, hold: () => {} }

function mount(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CommandPalette control={control} />
    </MemoryRouter>,
  )
}

const footer = (screen: { container: HTMLElement }) =>
  screen.container.querySelector('.fw-pal .foot')?.textContent ?? ''

beforeEach(() => {
  useStore.setState((state) => ({
    ui: { ...state.ui, palette: true, mode: 'advanced', entry: 'board', focusTarget: null },
    lang: { ...state.lang, lang: 'en' },
  }))
  useStore.getState().params.reset()
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

describe('the palette dialog', () => {
  it('is a modal dialog over a combobox and a listbox', async () => {
    const screen = await mount()
    await expect.element(screen.getByRole('dialog', { name: 'Commands' })).toBeVisible()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    expect(input?.getAttribute('role')).toBe('combobox')
    expect(input?.getAttribute('aria-expanded')).toBe('true')
    await expect.element(screen.getByRole('listbox', { name: 'Commands' })).toBeVisible()
  })

  it('renders nothing at all while it is closed', async () => {
    useStore.setState((state) => ({ ui: { ...state.ui, palette: false } }))
    const screen = await mount()
    expect(screen.container.querySelector('.fw-pal')).toBe(null)
  })

  it('takes the focus into the input when it opens', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await expect.poll(() => document.activeElement === input).toBe(true)
  })

  // The focus never leaving the input is what lets a screen reader read the row
  // while typing goes on.
  it('moves the active option with the arrows without moving the focus', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await expect.poll(() => document.activeElement === input).toBe(true)
    const first = input?.getAttribute('aria-activedescendant')
    await userEvent.keyboard('{ArrowDown}')
    const second = input?.getAttribute('aria-activedescendant')
    expect(second).not.toBe(first)
    expect(document.activeElement).toBe(input)
    const active = screen.container.querySelector(`#${CSS.escape(second ?? '')}`)
    expect(active?.getAttribute('aria-selected')).toBe('true')
  })

  it('filters as it is typed, and says so when nothing matches', async () => {
    const screen = await mount()
    const before = screen.container.querySelectorAll('[role="option"]').length
    expect(before).toBeGreaterThan(60)
    await userEvent.keyboard('seed')
    const after = screen.container.querySelectorAll('[role="option"]').length
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0)
    await userEvent.keyboard('zzzz')
    expect(screen.container.querySelectorAll('[role="option"]')).toHaveLength(0)
    await expect.element(screen.getByText('nothing matches seedzzzz')).toBeVisible()
  })

  // Measured as an effect, not a declared property: `overflow-y: auto` on a box
  // nothing constrains scrolls nothing.
  it('scrolls its list rather than cutting it off', async () => {
    await page.viewport(1280, 800)
    const screen = await mount()
    const list = screen.container.querySelector<HTMLElement>('.fw-pal .list')
    expect(list).not.toBe(null)
    expect(list?.scrollHeight ?? 0).toBeGreaterThan(list?.clientHeight ?? 0)
  })

  it('keeps the active option inside the list as the arrows walk past the fold', async () => {
    await page.viewport(1280, 800)
    const screen = await mount()
    const list = screen.container.querySelector<HTMLElement>('.fw-pal .list')
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    if (list === null || input === null) throw new Error('the palette is not on the page')
    await expect.poll(() => document.activeElement === input).toBe(true)
    // Thirty rows: the box holds roughly fifteen at this height.
    await userEvent.keyboard('{ArrowDown>30/}')
    const activeId = input.getAttribute('aria-activedescendant')
    const row = activeId === null ? null : screen.container.querySelector<HTMLElement>(`#${CSS.escape(activeId)}`)
    if (row === null) throw new Error('no active option after thirty presses')
    const box = list.getBoundingClientRect()
    const seat = row.getBoundingClientRect()
    expect(seat.top).toBeGreaterThanOrEqual(box.top - 0.5)
    expect(seat.bottom).toBeLessThanOrEqual(box.bottom + 0.5)
    // And the list really moved, so the two assertions above are not passing
    // because the thirtieth row happened to be on screen from the start.
    expect(list.scrollTop).toBeGreaterThan(0)
  })

  it('runs the active command on Enter and closes', async () => {
    await mount()
    await userEvent.keyboard('Saved boards')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  })

  it('closes on Escape', async () => {
    await mount()
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  })

  it('lists an unavailable command with its reason and refuses to run it', async () => {
    const screen = await mount()
    await userEvent.keyboard('Abort')
    const row = screen.container.querySelector('[role="option"]')
    expect(row?.getAttribute('aria-disabled')).toBe('true')
    expect(row?.textContent).toContain('nothing running')
    await userEvent.keyboard('{Enter}')
    expect(useStore.getState().ui.palette).toBe(true)
  })

  it('names all seven hotkeys on the lab, where every one of them is bound', async () => {
    const screen = await mount()
    expect(footer(screen)).toContain('generate')
    expect(footer(screen)).toContain('seed')
    expect(footer(screen)).toContain('report')
    expect(footer(screen)).toContain('settings')
    expect(screen.container.querySelectorAll('.fw-pal .foot span')).toHaveLength(7)
  })

  it('names all seven hotkeys on the saved boards too, where the drawers are', async () => {
    const screen = await mount('/boards')
    expect(footer(screen)).toContain('report')
    expect(footer(screen)).toContain('settings')
    expect(screen.container.querySelectorAll('.fw-pal .foot span')).toHaveLength(7)
  })

  it('drops the two run hints on the documentation route, where those keys are not bound', async () => {
    const screen = await mount('/docs/element')
    expect(footer(screen)).toContain('close')
    expect(footer(screen)).not.toContain('generate')
    expect(footer(screen)).not.toContain('seed')
    expect(footer(screen)).not.toContain('report')
    expect(footer(screen)).not.toContain('settings')
    expect(screen.container.querySelectorAll('.fw-pal .foot span')).toHaveLength(3)
  })

  it('keeps Tab inside itself', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(input)
  })

  // Typing after the presses shows the keys still reach the search box.
  it('keeps the focus in the input when a disabled row or the footer is pressed', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await expect.poll(() => document.activeElement === input).toBe(true)
    const abort = screen.container.querySelector<HTMLElement>('#cmd-run-abort')
    const foot = screen.container.querySelector<HTMLElement>('.fw-pal .foot')
    if (abort === null || foot === null) throw new Error('no abort row or footer')
    expect(abort.getAttribute('aria-disabled')).toBe('true')
    // `force`: Playwright will not press an `aria-disabled` element.
    await userEvent.click(abort, { force: true })
    expect(document.activeElement).toBe(input)
    await userEvent.click(foot)
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('seed')
    expect(input?.value).toBe('seed')
    expect(useStore.getState().ui.palette).toBe(true)
  })

  // The focus put on a row by hand: the one way left to move it off the input.
  it('closes on Escape wherever in the dialog the focus is', async () => {
    const screen = await mount()
    const abort = screen.container.querySelector<HTMLElement>('#cmd-run-abort')
    if (abort === null) throw new Error('no abort row')
    abort.focus()
    await userEvent.keyboard('{Escape}')
    expect(useStore.getState().ui.palette).toBe(false)
  })
})
