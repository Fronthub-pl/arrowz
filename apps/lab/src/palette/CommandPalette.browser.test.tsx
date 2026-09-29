import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MemoryRouter } from 'react-router'
import { buildCommand } from '@arrowz/engine/command'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { CommandPalette } from './CommandPalette'
import '../design/index.css'

const control: RunControl = { start: () => {}, abort: () => {}, hold: () => {}, checkSeeds: () => {} }

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

  // Chrome's issues panel flags a form field with neither.
  it('gives its input an id', async () => {
    const screen = await mount()
    expect(screen.container.querySelector('.fw-pal input')?.id).toBe('cmd-input')
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

  // Read at the document, after React's handler has run on the root.
  it('with nothing matching, the arrows, Home and End are left to the input', async () => {
    const screen = await mount()
    await userEvent.keyboard('seedzzzz')
    expect(screen.container.querySelectorAll('[role="option"]')).toHaveLength(0)
    const prevented: boolean[] = []
    const record = (event: KeyboardEvent) => prevented.push(event.defaultPrevented)
    document.addEventListener('keydown', record)
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Home}{End}')
    document.removeEventListener('keydown', record)
    expect(prevented).toEqual([false, false, false, false])
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

  it('runs an enabled row on a real click', async () => {
    const screen = await mount()
    const row = screen.container.querySelector<HTMLElement>('#cmd-view-rounded')
    if (row === null) throw new Error('no rounded row')
    await userEvent.click(row)
    await expect.poll(() => useStore.getState().ui.focusTarget).toBe('view-rounded')
    expect(useStore.getState().ui.palette).toBe(false)
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

describe('a pasted command', () => {
  const counting = () => {
    const runs: number[] = []
    return {
      runs,
      control: {
        start: () => runs.push(1),
        abort: () => {},
        hold: () => {},
        checkSeeds: () => {},
      } satisfies RunControl,
    }
  }

  it('shows one row, and loading it starts exactly one run', async () => {
    const { runs, control } = counting()
    const screen = await render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette control={control} />
      </MemoryRouter>,
    )
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    if (input === null) throw new Error('no input')
    await userEvent.fill(input, 'deno task carve --width=30 --height=40 --seed=5 --pstraight=0.9')
    const rows = screen.container.querySelectorAll('[role=option]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('Load this command')
    await userEvent.keyboard('{Enter}')
    expect(runs).toEqual([1])
    expect(useStore.getState().params.values.pStraight).toBe(0.9)
    expect(useStore.getState().ui.palette).toBe(false)
  })

  it('joins a command pasted over several lines', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    if (input === null) throw new Error('no input')
    // The line goes through the real clipboard, so the input's own handling of the line breaks is what is tested.
    const source = document.createElement('textarea')
    source.value = 'deno task carve --width=30 \\\n  --height=40 \\\n  --colored'
    document.body.append(source)
    source.select()
    await userEvent.copy()
    source.remove()
    input.focus()
    await userEvent.paste()
    expect(screen.container.querySelector('[role=option]')?.getAttribute('aria-disabled')).toBeNull()
  })

  it('brings back a copied lab command, quoted colours included, with one run', async () => {
    const { runs, control } = counting()
    useStore.getState().params.setMany({ W: 30, H: 40, seed: 5, pStraight: 0.9 })
    useStore.getState().view.apply({ colored: true, palette: ['#aa0000', '#00aa00'], ink: '#101010' })
    const state = useStore.getState()
    const line = buildCommand(state.params.values, viewOf(state.view))
    useStore.getState().params.reset()
    useStore.getState().view.apply({ colored: false, palette: [], ink: '' })
    try {
      const screen = await render(
        <MemoryRouter initialEntries={['/']}>
          <CommandPalette control={control} />
        </MemoryRouter>,
      )
      const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
      if (input === null) throw new Error('no input')
      await userEvent.fill(input, line)
      await userEvent.keyboard('{Enter}')
      const after = useStore.getState()
      expect([after.params.values.W, after.params.values.pStraight]).toEqual([30, 0.9])
      expect([after.view.colored, after.view.palette, after.view.ink]).toEqual([
        true,
        ['#aa0000', '#00aa00'],
        '#101010',
      ])
      expect(runs).toEqual([1])
    } finally {
      useStore.getState().view.apply({ colored: false, palette: [], ink: '' })
    }
  })

  it('switches the simple view to advanced for a pasted line with a pinned knob', async () => {
    useStore.getState().ui.setMode('simple')
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    if (input === null) throw new Error('no input')
    await userEvent.fill(input, '--width=30 --height=40 --pstraight=0.9')
    await userEvent.keyboard('{Enter}')
    expect(useStore.getState().ui.mode).toBe('advanced')
  })

  it('lists every problem in Polish under a row that cannot be chosen', async () => {
    useStore.getState().lang.setLang('pl')
    try {
      const { runs, control } = counting()
      const screen = await render(
        <MemoryRouter initialEntries={['/']}>
          <CommandPalette control={control} />
        </MemoryRouter>,
      )
      const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
      if (input === null) throw new Error('no input')
      await userEvent.fill(input, '--width=2000 --nope')
      const row = screen.container.querySelector('[role=option]')
      expect(row?.getAttribute('aria-disabled')).toBe('true')
      const list = document.getElementById(row?.getAttribute('aria-describedby') ?? '')
      expect([...(list?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
        'w komendzie brakuje --height',
        '--width=2000 jest poza zakresem 4..1000',
        '--nope to nieznana flaga',
      ])
      await userEvent.keyboard('{Enter}')
      expect(runs).toEqual([])
    } finally {
      useStore.getState().lang.setLang('en')
    }
  })
})
