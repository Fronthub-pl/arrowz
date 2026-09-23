import { act } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { useStore } from '../state/store'
import { TopBar } from './TopBar'

function renderBar() {
  return render(<TopBar presets={null} />)
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.lang.setLang('en')
  state.ui.setMode('simple')
  // The trigger toggles, so a case that left the palette open would make the
  // next one's click close it instead (harness fact 40's reasoning, applied
  // to a field this file's own last case moves).
  state.ui.closePalette()
  // The cases below leave the menu open; the next one's click would close it
  // instead (measured in review: the Escape case fails without it).
  state.ui.setMenu(false)
})

describe('TopBar', () => {
  // Spec §3.3: the preset's name and the "edited" mark live on the preset
  // picker now; the bar keeps the mark, the name of the product and the size.
  // The whole text is asserted, separators and all; the spaces a reader sees
  // are `gap`, not characters.
  it('names the product and the size, and no preset', async () => {
    const screen = await renderBar()
    await expect
      .element(screen.getByRole('banner'))
      .toHaveTextContent('Arrowz/25×50menu▼⌘Kcommand paletteSimpleAdvancedPLEN')
  })

  it('says nothing of an edit on the advanced lab face', async () => {
    useStore.getState().ui.setMode('advanced')
    const screen = await renderBar()
    await act(async () => useStore.getState().params.set('W', 26))
    await expect
      .element(screen.getByRole('banner'))
      .toHaveTextContent('Arrowz/26×50menu▼⌘Kcommand paletteSimpleAdvancedPLEN')
    expect(screen.container.querySelector('.preset')).toBeNull()
  })

  it('switches the view and remembers the choice', async () => {
    const screen = await renderBar()
    await screen.getByRole('radio', { name: 'Advanced' }).click()
    expect(useStore.getState().ui.mode).toBe('advanced')
    expect(localStorage.getItem('labView')).toBe('advanced')
    await expect.element(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true')
  })

  // Its own labels are the first to change: the bar reads the dictionary
  // like every other component, so the view's radio is renamed in place.
  it('switches the language, its own labels first, and remembers the choice', async () => {
    const screen = await renderBar()
    await screen.getByRole('radio', { name: 'PL' }).click()
    expect(useStore.getState().lang.lang).toBe('pl')
    expect(localStorage.getItem('labLang')).toBe('pl')
    await expect.element(screen.getByRole('radiogroup', { name: 'Widok' })).toBeVisible()
    await expect.element(screen.getByRole('radio', { name: 'Zaawansowany' })).toBeVisible()
  })

  // The lab had no h1 at all, so the report's h3 sat under nothing. The
  // product's name is the document's title, because it is.
  it('names the document once, at the top level', async () => {
    const screen = await renderBar()
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Arrowz' })).toBeVisible()
  })

  // Spec §9: the mock's trigger is a glyph and nothing else, so its name comes
  // from the dictionary and says what the glyph means.
  it('offers the palette under an accessible name that states the shortcut', async () => {
    const screen = await renderBar()
    const trigger = screen.getByRole('button', { name: 'Command palette (⌘K)' })
    await expect.element(trigger).toBeVisible()
    await trigger.click()
    expect(useStore.getState().ui.palette).toBe(true)
  })

  it('the menu chip controls the right group and toggles the menu', async () => {
    const screen = await renderBar()
    const chip = screen.getByRole('button', { name: 'menu', exact: true })
    await expect.element(chip).toHaveAttribute('aria-controls', 'top-menu')
    await expect.element(chip).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('top-menu')?.classList.contains('right')).toBe(true)
    await chip.click()
    expect(useStore.getState().ui.menu).toBe(true)
    await expect.element(chip).toHaveAttribute('aria-expanded', 'true')
  })

  it('Escape inside the open menu closes it and returns the focus to the chip', async () => {
    const screen = await renderBar()
    const chip = screen.getByRole('button', { name: 'menu', exact: true })
    await chip.click()
    screen.getByRole('radio', { name: 'PL' }).element().focus()
    await userEvent.keyboard('{Escape}')
    expect(useStore.getState().ui.menu).toBe(false)
    expect(document.activeElement).toBe(chip.element())
  })

  it('a press outside the open menu closes it', async () => {
    const screen = await renderBar()
    await screen.getByRole('button', { name: 'menu', exact: true }).click()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await expect.poll(() => useStore.getState().ui.menu).toBe(false)
  })

  it('⌘K carries a word for touch inside its accessible name, and closes the menu', async () => {
    const screen = await renderBar()
    await act(async () => useStore.getState().ui.setMenu(true))
    const trigger = screen.getByRole('button', { name: 'Command palette (⌘K)' })
    const el = trigger.element()
    expect(el.querySelector('.k-key')?.textContent).toBe('⌘K')
    const word = el.querySelector('.k-touch')?.textContent ?? ''
    expect(word).toBe('command palette')
    expect((el.getAttribute('aria-label') ?? '').toLowerCase()).toContain(word)
    await trigger.click()
    expect(useStore.getState().ui.menu).toBe(false)
    expect(useStore.getState().ui.palette).toBe(true)
    await act(async () => useStore.getState().ui.closePalette())
  })
})
