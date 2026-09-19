import { simpleParams } from '@arrowz/engine/simple'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { SimplePanel } from './SimplePanel'

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

const state = () => useStore.getState()

/** The knobs the recipe on screen gives with the seed on screen — what every write below must leave. */
const drawn = () => simpleParams({ ...state().recipe.value, seed: state().params.values.seed }, null)

/**
 * A range input moved the way a drag moves it: the native value setter, then
 * the `input` event React listens to. `fill` does not drive a range input, and
 * a click lands wherever the pointer is.
 */
function slide(input: HTMLInputElement | null, value: number) {
  if (!input) throw new Error('no such slider')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  state().params.reset()
  state().recipe.reset()
  state().recipe.setRandom(false)
  state().ui.raiseClamped(false)
})

describe('SimplePanel', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  })

  // A size is typed like a knob (§5.5) and moves the recipe, the knobs and the
  // export cell at once; the run is the debounce's (Task 4), so none here.
  it('writes a typed width into the recipe and the knobs, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    // Relative: `recipe.edits` only grows, and `reset()` leaves it alone on purpose.
    const shaped = state().recipe.edits
    await screen.getByRole('button', { name: /^width/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '120')
    await userEvent.keyboard('{Enter}')
    expect(state().recipe.value.W).toBe(120)
    expect(state().params.values).toEqual(drawn())
    expect(state().view.cell).toBe(13)
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  it('moves the recipe and the knobs with a slider, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const shaped = state().recipe.edits
    slide(screen.container.querySelector<HTMLInputElement>('#simple-lengths'), 20)
    await expect.poll(() => state().recipe.value.lengths).toBe(0.2)
    expect(state().params.values).toEqual(drawn())
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  // Spec §2.2: the segmented button is immediate, and the knobs are rewritten
  // before the run reads them.
  it('runs at once when the skeleton is switched, on the knobs it gives', async () => {
    const seen: unknown[] = []
    const control: RunControl = {
      start: () => void seen.push({ ...state().params.values }),
      abort: () => {},
      hold: () => {},
    }
    const shaped = state().recipe.edits
    const screen = await render(<SimplePanel control={control} />)
    await screen.getByRole('radio', { name: 'with a skeleton' }).click()
    expect(state().recipe.value.skeleton).toBe('on')
    expect(seen).toEqual([drawn()])
    expect(state().recipe.edits).toBe(shaped)
  })

  // The machine path (Ruling 4): a seed typed here must not wake an `auto`
  // left on in the advanced view, and the old seed field starts nothing.
  it('writes a typed seed into the knobs without counting it as a knob edit', async () => {
    const g = stub()
    state().ui.setAuto(true)
    const typed = state().params.edits
    const screen = await render(<SimplePanel control={g.control} />)
    await screen.getByRole('button', { name: /^seed/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '4242')
    await userEvent.keyboard('{Enter}')
    expect(state().params.values.seed).toBe(4242)
    expect(state().params.edits).toBe(typed)
    expect(g.started()).toBe(0)
    state().ui.setAuto(false)
  })

  it('switches randomising without running', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    await screen.getByRole('switch', { name: /randomise the settings/ }).click()
    expect(state().recipe.value.random).toBe(true)
    expect(g.started()).toBe(0)
  })

  // Ruling 9: cell, voids and top are advanced-only.
  it('shows the preview fields the old simple view shows, and only those', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByLabelText('stroke width (grid units)')).toBeVisible()
    await expect.element(screen.getByRole('switch', { name: /round the corners/ })).toBeVisible()
    await expect.element(screen.getByRole('switch', { name: /highlight the longest/ })).toBeVisible()
    expect(screen.container.querySelector('#view-cell')).toBeNull()
    expect(screen.container.querySelector('#view-top')).toBeNull()
    expect(screen.getByRole('switch', { name: /show jammed cells/ }).query()).toBeNull()
  })

  // The third owner of the shared field (Ruling 2). No case here committed a view
  // field before, which is why `tsc` was the only thing between this panel and a
  // field that opens empty and throws `onCommit is not a function` on blur.
  it('a view field in the simple panel still writes the lab’s view', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
    await userEvent.fill(stroke, '0.8')
    await userEvent.tab()
    expect(useStore.getState().view.stroke).toBe(0.8)
  })

  // Spec §6: "the simple view gets the picker and not the custom editor."
  it('offers the theme picker, and writes a choice into the lab’s view', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const picker = screen.getByRole('combobox')
    await expect.element(picker).toBeInTheDocument()
    await userEvent.selectOptions(picker, 'gruvbox-dark')
    expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  })
})
