import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { TopBar } from './TopBar'

/** The bar reads the route now (Task 3): every case below is the lab route
 * unless it says otherwise, the route the preset strip itself lives on
 * (`Workspace.tsx`: `lab && !simple`). */
function renderBar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TopBar />
    </MemoryRouter>,
  )
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
  // Spec §5.1 gives the bar "mark, preset name, dims", and the name is the one
  // piece of derived logic in it. The store's defaults are 25×50, which
  // `easy-portrait` spells exactly, so the bar has a preset to name on the
  // first paint. The whole text is asserted, separators and all: the spaces a
  // reader sees around them are `gap`, not characters, and a bar that lost the
  // size or gained a stray label would pass a looser match. The right group's
  // radios are part of the banner's text: `Simple`, `Advanced`, `PL`, `EN`,
  // with no separators, because the gaps between them are `gap` too.
  it('names the preset the knobs spell, beside the size', async () => {
    const screen = await renderBar()
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/Easy portrait/25×50⌘KSimpleAdvancedPLEN')
  })

  // The other branch: one knob off a preset and no preset spells the knobs,
  // so the bar says so where the name stood (spec R5) — but only on the
  // advanced lab face, the one face with a preset strip for the knobs to have
  // wandered away from (Task 3). The preset strip used to carry this word as
  // a sticky chip that covered its last chips (review P4).
  it('says the values are edited, where the name stood, when no preset spells the knobs on the advanced lab face', async () => {
    useStore.getState().ui.setMode('advanced')
    const screen = await renderBar()
    await act(async () => useStore.getState().params.set('W', 26))
    await expect
      .element(screen.getByRole('banner'))
      .toHaveTextContent('Arrowz/edited/26×50⌘KSimpleAdvancedPLEN')
  })

  // The simple view has no preset strip at all (`Workspace.tsx`: `lab &&
  // !simple`), so "edited" would answer a question nobody on this face is
  // asking. The slot prints nothing, and its separator goes with it — the
  // bar's text does not end in a dangling "/".
  it('says nothing where the name stood, when no preset spells the knobs on the simple face', async () => {
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
