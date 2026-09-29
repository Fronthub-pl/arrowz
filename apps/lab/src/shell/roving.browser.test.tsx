import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useFocusFollowsSelection } from './roving'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Three buttons, the selected one carrying the hook's ref; `tick` forces a render with the same selection. */
function Strip({ selected, tick }: { selected: number; tick: number }) {
  const focusRef = useFocusFollowsSelection(selected)
  return (
    <div data-tick={tick}>
      {[0, 1, 2].map((i) => (
        <button key={i} type="button" ref={i === selected ? focusRef : undefined}>
          {`b${i}`}
        </button>
      ))}
    </div>
  )
}

test('the focus follows the selection while the strip holds it, and a render with the same selection does not refocus', async () => {
  const screen = await render(<Strip selected={0} tick={0} />)
  screen.getByRole('button', { name: 'b0' }).element().focus()
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  await screen.rerender(<Strip selected={0} tick={1} />)
  expect(focus).not.toHaveBeenCalled()
  await screen.rerender(<Strip selected={2} tick={2} />)
  await expect.element(screen.getByRole('button', { name: 'b2' })).toHaveFocus()
})

test('a selection made while the focus is elsewhere leaves the focus there', async () => {
  const screen = await render(
    <>
      <input aria-label="outside" />
      <Strip selected={0} tick={0} />
    </>,
  )
  screen.getByRole('textbox', { name: 'outside' }).element().focus()
  await screen.rerender(
    <>
      <input aria-label="outside" />
      <Strip selected={1} tick={1} />
    </>,
  )
  await expect.element(screen.getByRole('textbox', { name: 'outside' })).toHaveFocus()
})
