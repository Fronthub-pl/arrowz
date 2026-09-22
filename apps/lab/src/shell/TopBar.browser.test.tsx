import { act } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { TopBar } from './TopBar'

function renderBar() {
  return render(<TopBar />)
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
})

describe('TopBar', () => {
  // Spec §3.3: the preset's name and the "edited" mark live on the preset
  // picker now; the bar keeps the mark, the name of the product and the size.
  // The whole text is asserted, separators and all; the spaces a reader sees
  // are `gap`, not characters.
  it('names the product and the size, and no preset', async () => {
    const screen = await renderBar()
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/25×50⌘KSimpleAdvancedPLEN')
  })

  it('says nothing of an edit on the advanced lab face', async () => {
    useStore.getState().ui.setMode('advanced')
    const screen = await renderBar()
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/26×50⌘KSimpleAdvancedPLEN')
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
})
