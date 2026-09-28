import { useRef, useState } from 'react'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'
import { useDismiss } from './useDismiss'

/** A trigger, a popover holding one button, and one button outside; open at mount. */
function Probe({ focusOut = false }: { focusOut?: boolean }) {
  const [open, setOpen] = useState(true)
  const [renders, setRenders] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useDismiss({
    open,
    inside: [pop, trigger],
    onClose: () => setOpen(false),
    refocus: trigger,
    closeOnFocusOut: focusOut,
  })
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        trigger
      </button>
      <div ref={pop} data-testid="pop" data-open={String(open)}>
        <button type="button" onClick={() => setRenders((n) => n + 1)}>
          inside
        </button>
      </div>
      <button type="button">outside</button>
      <button type="button">elsewhere</button>
      <output data-testid="renders">{renders}</output>
    </>
  )
}

const button = (name: string) => {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === name)
  if (found === undefined) throw new Error(`no button ${name}`)
  return found
}

const escape = (target: Element) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

test('a press outside closes it without moving the focus', async () => {
  const screen = await render(<Probe />)
  button('inside').focus()
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'false')
  expect(document.activeElement).toBe(button('inside'))
})

test('a press inside or on the trigger leaves it open', async () => {
  const screen = await render(<Probe />)
  button('inside').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button('trigger').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'true')
})

test('Escape inside closes it, is consumed, and returns the focus to the trigger', async () => {
  const screen = await render(<Probe />)
  button('inside').focus()
  const event = escape(button('inside'))
  expect(event.defaultPrevented).toBe(true)
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'false')
  expect(document.activeElement).toBe(button('trigger'))
})

test('Escape outside leaves it open and is not consumed', async () => {
  const screen = await render(<Probe />)
  button('outside').focus()
  const event = escape(button('outside'))
  expect(event.defaultPrevented).toBe(false)
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'true')
})

test('focus leaving the popover closes it only with closeOnFocusOut', async () => {
  const without = await render(<Probe />)
  button('inside').focus()
  button('outside').focus()
  await expect.element(without.getByTestId('pop')).toHaveAttribute('data-open', 'true')
  await without.unmount()

  const withOption = await render(<Probe focusOut />)
  button('inside').focus()
  button('outside').focus()
  await expect.element(withOption.getByTestId('pop')).toHaveAttribute('data-open', 'false')
})

test('focus moving between two outside elements leaves it open', async () => {
  const screen = await render(<Probe focusOut />)
  button('outside').focus()
  button('elsewhere').focus()
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'true')
})

test('a re-render while open does not register the listeners again', async () => {
  const add = vi.spyOn(document, 'addEventListener')
  const screen = await render(<Probe />)
  const before = add.mock.calls.filter(([type]) => type === 'pointerdown').length
  button('inside').click()
  await expect.element(screen.getByTestId('renders')).toHaveTextContent('1')
  expect(add.mock.calls.filter(([type]) => type === 'pointerdown').length).toBe(before)
  add.mockRestore()
})
